import { type NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { libraryFiles } from '@/server/db/schema';
import { deleteSeries, getSeries, updateSeries } from '@/server/db/series';
import { listVolumesBySeries } from '@/server/db/volumes';
import { getVolumeReadStates } from '@/server/db/reading-progress';
import { requireUserId } from '@/server/auth/require-user';
import { proxiedCoverUrl } from '@/server/images/allowlist';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';
import { SeriesPatchBody } from '@/server/openapi/schemas/series';
import { getGroup, groupPath, moveSeriesToGroup } from '@/server/db/library-groups';
import { recordActivity } from '@/server/db/activity-events';
import { activeJobKindsForSeries } from '@/server/db/jobs';

export const dynamic = 'force-dynamic';

/** Library-group display path for a series row ('' when ungrouped). */
async function groupPathOf(groupId: number | null): Promise<string> {
  return groupId == null ? '' : (await groupPath(groupId)).join(' / ');
}

type Ctx = { params: Promise<{ id: string }> };

async function resolveId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const row = await getSeries(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Per-volume read state (finished / reading / unread) for the current user, so
  // the client can mark which volumes have been read.
  const userId = await requireUserId(req);
  const readStates = userId !== null ? await getVolumeReadStates(userId, id) : new Map();

  // Enrich to the mobile SeriesDetail shape (summary fields + volumesList),
  // keeping the raw fields the web reads. Owned = a volume that has a file.
  const vols = await listVolumesBySeries(id);
  const ownedRows = await getDb()
    .select({ volumeId: libraryFiles.volumeId, fileId: libraryFiles.id })
    .from(libraryFiles)
    .where(eq(libraryFiles.seriesId, id));
  const owned = new Set(ownedRows.map((r) => r.volumeId).filter((v): v is number => v !== null));
  // First library file per volume, so the client can open a "Read now" reader
  // for an owned volume (paged readers key off the file id).
  const fileByVolume = new Map<number, number>();
  for (const r of ownedRows) {
    if (r.volumeId !== null && !fileByVolume.has(r.volumeId)) fileByVolume.set(r.volumeId, r.fileId);
  }
  const volumesList = vols.map((v) => {
    // Per-volume cover lives in metadataJson.coverUrl (filled by the hydrate
    // jobs). Route external CDN covers through the caching /api/img proxy so the
    // mobile client — which can't add the MangaDex Referer — can load them. The
    // path is root-relative; the client resolves it against its server URL.
    let coverUrl: string | null = null;
    try {
      const meta = JSON.parse(v.metadataJson) as Record<string, unknown>;
      if (typeof meta?.coverUrl === 'string') coverUrl = proxiedCoverUrl(meta.coverUrl);
    } catch {
      /* malformed metadata -> no cover */
    }
    return {
      id: v.id,
      number: v.number,
      title: v.title,
      status: owned.has(v.id) ? ('imported' as const) : ('wanted' as const),
      publishedAt: v.releaseDate ? v.releaseDate.toISOString() : null,
      coverUrl,
      libraryFileId: fileByVolume.get(v.id) ?? null,
      read: (readStates.get(v.id) ?? 'unread') as 'unread' | 'reading' | 'finished',
    };
  });

  const activeKinds = await activeJobKindsForSeries(id);
  const hydrating = activeKinds.length > 0;

  return NextResponse.json({
    ...row,
    title: row.titleEnglish ?? row.titleRomaji ?? row.titleNative ?? `Series #${row.id}`,
    monitored: row.monitoring !== 'none',
    volumes: vols.length,
    downloaded: owned.size,
    groupPath: await groupPathOf(row.groupId),
    volumesList,
    hydrating,
  });
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let parsed;
  try {
    const body = await req.json();
    parsed = SeriesPatchBody.parse(body);
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // `groupId` is a move, not a column update — split it off and validate the
  // target group BEFORE applying any field updates (no partial application on
  // a 422). `null` ungroups; an unknown id is rejected.
  const { groupId, ...fields } = parsed;
  if (groupId !== undefined && groupId !== null && (await getGroup(groupId)) === null) {
    return NextResponse.json(
      { error: 'invalid groupId', detail: `library group ${groupId} does not exist` },
      { status: 422 },
    );
  }

  await updateSeries(id, fields);
  let row = await getSeries(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const actor = await auditActor(req);
  const auditCtx = auditContext(req);
  if (Object.keys(fields).length > 0) {
    await recordAuditEvent({
      actor,
      action: 'series.update',
      target: { kind: 'series', id: String(id) },
      metadata: { fields: Object.keys(fields) },
      context: auditCtx,
    });
  }

  if (groupId !== undefined && groupId !== row.groupId) {
    await moveSeriesToGroup(id, groupId);
    const toPath = await groupPathOf(groupId);
    const title = row.titleEnglish ?? row.titleRomaji ?? row.titleNative;
    await recordAuditEvent({
      actor,
      action: 'series.move_group',
      target: { kind: 'series', id: String(id) },
      metadata: { title, fromGroupId: row.groupId, toGroupId: groupId, toGroupPath: toPath },
      context: auditCtx,
    });
    // Activity feed: best-effort, attributed to the acting user when known.
    await recordActivity({
      userId: actor.kind === 'user' ? actor.userId : null,
      kind: 'moved',
      seriesId: id,
      meta: { title, groupId, groupPath: toPath },
    });
    row = (await getSeries(id)) ?? row;
  }

  return NextResponse.json({ ...row, groupPath: await groupPathOf(row.groupId) });
}

export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const existing = await getSeries(id);
  await deleteSeries(id);
  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'series.delete',
    target: { kind: 'series', id: String(id) },
    metadata: { title: existing?.titleEnglish ?? null, contentType: existing?.contentType ?? null },
    context: auditContext(req),
  });
  return new NextResponse(null, { status: 204 });
}
