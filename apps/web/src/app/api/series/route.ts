import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { inArray, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { volumes, libraryFiles } from '@/server/db/schema';
import { insertSeries, listSeriesPaginated, getSeries, getSeriesHealth } from '@/server/db/series';
import { getSeriesReadStates } from '@/server/db/reading-progress';
import { requireUserId } from '@/server/auth/require-user';
import { enqueueJob } from '@/server/db/jobs';
import { contentTypeSubdir, getMediaRoot } from '@/server/content-type/paths';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';
import { recordActivity } from '@/server/db/activity-events';
import { getSeriesBySlug, NovelUpdatesError } from '@/server/integrations/novelupdates';
import { metadataHydrateDescriptor } from '@/server/jobs/kinds/metadata-hydrate';
import { comicvineHydrateDescriptor } from '@/server/jobs/kinds/comicvine-hydrate';
import { novelUpdatesHydrateDescriptor } from '@/server/jobs/kinds/novel-updates-hydrate';
import { SeriesCreateBody, SeriesListQuery } from '@/server/openapi/schemas/series';
import { getGroup, groupPath, listGroups } from '@/server/db/library-groups';
import { googleBooksHydrateDescriptor } from '@/server/jobs/kinds/googlebooks-hydrate';
import { createSeriesFromMatch } from '@/server/importer/adopt';
import { sanitizeForFs, kickHydrate, enqueueReleaseSearchOnAdd } from '@/server/importer/series-helpers';
import type { Candidate } from '@/server/importer/match-candidate';

export const dynamic = 'force-dynamic';

/** Attach the library-group display path to a single series row ('' when ungrouped). */
async function withGroupPath<T extends { groupId: number | null }>(
  row: T,
): Promise<T & { groupPath: string }> {
  const path = row.groupId == null ? '' : (await groupPath(row.groupId)).join(' / ');
  return { ...row, groupPath: path };
}

/**
 * Default root path for a series when the client didn't pick one (mobile
 * quick-add): `<mediaRoot>/<contentType subdir>/<sanitized title>`. Mirrors the
 * convention the ebook/audiobook branches already use.
 */
async function deriveDefaultRoot(
  contentType: 'manga' | 'comic' | 'light_novel',
  title: string,
): Promise<string> {
  const root = await getMediaRoot();
  return `${root}/${contentTypeSubdir(contentType)}/${sanitizeForFs(title || 'Untitled')}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const params = SeriesListQuery.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
  });
  if (!params.success) {
    return NextResponse.json({ error: params.error.message }, { status: 400 });
  }
  const { rows, total } = await listSeriesPaginated(params.data);

  // Enrich each row with the list-summary fields the mobile app needs (title,
  // monitored, volume + downloaded counts) WITHOUT dropping the raw fields the
  // web (RerouteSheet) still reads. The mobile zod schema ignores extras.
  const ids = rows.map((r) => r.id);
  const volCount = new Map<number, number>();
  const ownedCount = new Map<number, number>();
  if (ids.length > 0) {
    const vc = await getDb()
      .select({ seriesId: volumes.seriesId, c: sql<number>`count(*)` })
      .from(volumes)
      .where(inArray(volumes.seriesId, ids))
      .groupBy(volumes.seriesId);
    for (const r of vc) volCount.set(r.seriesId, Number(r.c));
    const oc = await getDb()
      .select({
        seriesId: libraryFiles.seriesId,
        c: sql<number>`count(distinct ${libraryFiles.volumeId})`,
      })
      .from(libraryFiles)
      .where(inArray(libraryFiles.seriesId, ids))
      .groupBy(libraryFiles.seriesId);
    for (const r of oc) ownedCount.set(r.seriesId, Number(r.c));
  }

  // Per-series reading state (per user) + download health, for the library
  // Reading/Health filters. Best-effort: a missing user → all 'unread'.
  const userId = await requireUserId(req);
  const [readStates, health] = await Promise.all([
    userId != null ? getSeriesReadStates(userId) : Promise.resolve(new Map()),
    getSeriesHealth(),
  ]);

  // Library-group display paths: one listGroups() query, in-memory path walk —
  // never a per-row groupPath() call (same idiom as GET /api/library/groups).
  const groups = await listGroups();
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const pathOf = (id: number): string => {
    const parts: string[] = [];
    let cursor: number | null = id;
    while (cursor !== null) {
      const g = groupById.get(cursor);
      if (!g) break;
      parts.unshift(g.name);
      cursor = g.parentId;
    }
    return parts.join(' / ');
  };

  const enriched = rows.map((r) => ({
    ...r,
    title: r.titleEnglish ?? r.titleRomaji ?? r.titleNative ?? `Series #${r.id}`,
    monitored: r.monitoring !== 'none',
    volumes: volCount.get(r.id) ?? 0,
    downloaded: ownedCount.get(r.id) ?? 0,
    readState: readStates.get(r.id) ?? 'unread',
    health: health.get(r.id) ?? 'missing',
    groupPath: r.groupId == null ? '' : pathOf(r.groupId),
  }));

  return NextResponse.json({
    rows: enriched,
    total,
    page: params.data.page,
    limit: params.data.limit,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  let parsed: z.infer<typeof SeriesCreateBody>;
  try {
    const body = await req.json();
    parsed = SeriesCreateBody.parse(body);
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // Library-group assignment is common to every content-type branch — validate
  // it up front so no branch can insert a series pointing at a missing group.
  if (parsed.groupId !== undefined && (await getGroup(parsed.groupId)) === null) {
    return NextResponse.json(
      { error: 'invalid groupId', detail: `library group ${parsed.groupId} does not exist` },
      { status: 422 },
    );
  }

  // The Library and series pages are server-rendered; bust their cache so a
  // newly created series shows up without a manual hard reload. revalidatePath
  // needs Next's request store, which is absent when the handler is invoked
  // directly (e.g. unit tests) — treat it as a best-effort cache hint.
  const created = (body: unknown): NextResponse => {
    try {
      revalidatePath('/library');
    } catch {
      // No request scope (test/edge invocation) — creation still succeeds.
    }
    return NextResponse.json(body, { status: 201 });
  };

  const actor = await auditActor(req);
  const ctx = auditContext(req);
  const recordCreate = async (id: number, title: string | null): Promise<void> => {
    await recordAuditEvent({
      actor,
      action: 'series.create',
      target: { kind: 'series', id: String(id) },
      metadata: { contentType: parsed.contentType, title },
      context: ctx,
    });
    // Activity feed: attribute the add to the acting user (null for anonymous /
    // system callers). Best-effort — never breaks series creation.
    await recordActivity({
      userId: actor.kind === 'user' ? actor.userId : null,
      kind: 'added',
      seriesId: id,
      meta: { title, contentType: parsed.contentType },
    });
  };

  try {
    if (parsed.contentType === 'comic') {
      const id = await insertSeries({
        contentType: 'comic',
        anilistId: null,
        comicvineId: parsed.comicvineId,
        publisher: parsed.publisher ?? null,
        startYear: parsed.startYear ?? null,
        titleEnglish: parsed.titleEnglish,
        status: parsed.status,
        rootPath: parsed.rootPath ?? (await deriveDefaultRoot('comic', parsed.titleEnglish)),
        qualityProfileId: parsed.qualityProfileId,
        description: parsed.description ?? null,
        coverUrl: parsed.coverUrl ?? null,
        monitoring: parsed.monitoring,
        granularity: 'chapter',
        groupId: parsed.groupId ?? null,
      });
      await enqueueJob('comicvine_hydrate', { seriesId: id });
      kickHydrate(comicvineHydrateDescriptor);
      await enqueueReleaseSearchOnAdd(id, parsed.monitoring);
      await recordCreate(id, parsed.titleEnglish);
      const row = await getSeries(id);
      return created(row ? await withGroupPath(row) : row);
    } else if (parsed.contentType === 'light_novel') {
      // NovelUpdates-only novels (no anilistId) hydrate title/cover/description
      // from the NU series page at create time so the row isn't a bare typed
      // title. A scrape failure is non-fatal — the series is still created with
      // the supplied fields and the background NU hydrate job will retry.
      //
      // NOTE: do NOT store NU aliases as extraSearchTerms. The indexer query
      // template is `{title} {extra}`, which AND-appends every extra term — so a
      // list of foreign-language aliases (Korean/Japanese/Chinese) over-constrains
      // the release search to zero matches. The English/romaji title finds the
      // releases; alias-based search would need a separate alt-query mechanism.
      const nuOnly = parsed.anilistId == null && parsed.novelUpdatesSlug != null;
      let titleEnglish = parsed.titleEnglish;
      let titleRomaji = parsed.titleRomaji ?? null;
      let coverUrl = parsed.coverUrl ?? null;
      let description = parsed.description ?? null;
      let author = parsed.author ?? null;
      if (nuOnly) {
        try {
          const detail = await getSeriesBySlug(parsed.novelUpdatesSlug!);
          titleEnglish = detail.title || titleEnglish;
          titleRomaji = titleRomaji ?? (detail.title || null);
          coverUrl = coverUrl ?? detail.coverUrl;
          description = description ?? detail.description;
          author = author ?? detail.author;
        } catch (err) {
          if (!(err instanceof NovelUpdatesError)) throw err;
          // soft-fail: keep the typed title; the hydrate job will fill the rest.
        }
      }
      const id = await insertSeries({
        contentType: 'light_novel',
        anilistId: parsed.anilistId ?? null,
        author,
        titleEnglish,
        titleRomaji,
        titleNative: parsed.titleNative ?? null,
        status: parsed.status,
        rootPath: parsed.rootPath ?? (await deriveDefaultRoot('light_novel', titleEnglish)),
        qualityProfileId: parsed.qualityProfileId,
        coverUrl,
        description,
        totalVolumes: parsed.totalVolumes ?? null,
        totalChapters: parsed.totalChapters ?? null,
        monitoring: parsed.monitoring,
        granularity: 'volume',
        novelUpdatesSlug: parsed.novelUpdatesSlug ?? null,
        groupId: parsed.groupId ?? null,
      });
      // AniList-anchored novels seed volumes via metadata_hydrate. NU-only novels
      // have no AniList id to hydrate from; metadata_hydrate now re-hydrates them
      // from the NU client (and seeds no volumes — those auto-create on import).
      await enqueueJob('metadata_hydrate', { seriesId: id });
      await enqueueJob('googlebooks_hydrate', { seriesId: id });
      // If a NovelUpdates slug is present, also enqueue the NU hydrate job (fills
      // novelUpdatesId / author / aliases and enables chapter sync).
      if (parsed.novelUpdatesSlug) {
        await enqueueJob('novel_updates_hydrate', { seriesId: id });
        kickHydrate(metadataHydrateDescriptor, novelUpdatesHydrateDescriptor, googleBooksHydrateDescriptor);
      } else {
        kickHydrate(metadataHydrateDescriptor, googleBooksHydrateDescriptor);
      }
      await enqueueReleaseSearchOnAdd(id, parsed.monitoring);
      await recordCreate(id, titleEnglish);
      return created({ id });
    } else if (parsed.contentType === 'ebook') {
      const candidate: Candidate = {
        sourceId: parsed.olid,
        title: parsed.title,
        author: parsed.author ?? null,
        year: parsed.year ?? null,
        isbn: parsed.isbn ?? null,
        coverUrl: parsed.coverUrl ?? null,
        source: 'openlibrary',
      };
      const totalVolumes = parsed.flow === 'single' ? 1 : parsed.totalVolumes;
      // Coerce the full MonitoringEnum to the binary all/none that createSeriesFromMatch uses.
      // ebook monitoring is always 'all' or 'none'; 'future'/'missing' are manga/comic patterns.
      const monitoringBinary: 'all' | 'none' = parsed.monitoring === 'none' ? 'none' : 'all';
      const id = await createSeriesFromMatch(candidate, 'ebook', {
        qualityProfileId: parsed.qualityProfileId,
        monitoring: monitoringBinary,
        description: parsed.description ?? null,
        totalVolumes: totalVolumes ?? null,
        groupId: parsed.groupId ?? null,
      });
      await recordCreate(id, parsed.title);
      const row = await getSeries(id);
      return created(row ? await withGroupPath(row) : row);
    } else if (parsed.contentType === 'audiobook') {
      // Audiobooks have no provider ID in this path; sourceId/source are not
      // used in the audiobook branch of createSeriesFromMatch.
      const candidate: Candidate = {
        sourceId: '',
        title: parsed.title,
        author: parsed.author ?? null,
        year: parsed.year ?? null,
        isbn: null,
        coverUrl: parsed.coverUrl ?? null,
        source: 'openlibrary',
      };
      const monitoringBinary: 'all' | 'none' = parsed.monitoring === 'none' ? 'none' : 'all';
      const id = await createSeriesFromMatch(candidate, 'audiobook', {
        qualityProfileId: parsed.qualityProfileId,
        monitoring: monitoringBinary,
        description: parsed.description ?? null,
        asin: parsed.asin ?? null,
        narrator: parsed.narrator ?? null,
        runtimeMinutes: parsed.runtimeMinutes ?? null,
        groupId: parsed.groupId ?? null,
      });
      await recordCreate(id, parsed.title);
      const row = await getSeries(id);
      return created(row ? await withGroupPath(row) : row);
    } else {
      // Manga and other content types — existing path
      const id = await insertSeries({
        contentType: parsed.contentType,
        anilistId: parsed.anilistId ?? null,
        malId: parsed.malId ?? null,
        mangadexId: parsed.mangadexId ?? null,
        titleEnglish: parsed.titleEnglish ?? null,
        titleRomaji: parsed.titleRomaji ?? null,
        titleNative: parsed.titleNative ?? null,
        status: parsed.status,
        coverUrl: parsed.coverUrl ?? null,
        description: parsed.description ?? null,
        totalVolumes: parsed.totalVolumes ?? null,
        totalChapters: parsed.totalChapters ?? null,
        rootPath:
          parsed.rootPath ?? (await deriveDefaultRoot('manga', parsed.titleEnglish ?? 'Untitled')),
        monitoring: parsed.monitoring,
        granularity: parsed.granularity,
        qualityProfileId: parsed.qualityProfileId,
        extraSearchTermsJson: parsed.extraSearchTermsJson,
        groupId: parsed.groupId ?? null,
      });
      // Hydration routing: an AniList id (with or without a cross-linked MAL id)
      // uses the AniList-backed metadata_hydrate path. A MAL-only add (no
      // anilistId but a malId) enqueues mal_hydrate instead — its handler is
      // added in a later task.
      if (parsed.anilistId != null) {
        await enqueueJob('metadata_hydrate', { seriesId: id });
        kickHydrate(metadataHydrateDescriptor);
      } else if (parsed.malId != null) {
        // mal_hydrate has no immediate-kick descriptor wired yet (handler lands
        // in a later task); the worker tick picks it up.
        await enqueueJob('mal_hydrate', { seriesId: id });
      } else {
        await enqueueJob('metadata_hydrate', { seriesId: id });
        kickHydrate(metadataHydrateDescriptor);
      }
      await enqueueReleaseSearchOnAdd(id, parsed.monitoring);
      await recordCreate(id, parsed.titleEnglish ?? null);
      const row = await getSeries(id);
      return created(row ? await withGroupPath(row) : row);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed/i.test(message)) {
      return NextResponse.json(
        { error: 'series already exists', detail: message },
        { status: 409 },
      );
    }
    if (/FOREIGN KEY constraint failed/i.test(message)) {
      return NextResponse.json(
        { error: 'invalid foreign key (likely qualityProfileId)', detail: message },
        { status: 422 },
      );
    }
    throw err;
  }
}
