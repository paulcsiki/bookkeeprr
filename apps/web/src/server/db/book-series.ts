import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ContentType } from '@bookkeeprr/types/pure';
import { getDb } from './client';
import {
  bookSeries, bookSeriesMembers, bookSeriesEntries, series, libraryFiles,
  type BookSeriesRow, type BookSeriesMemberRow, type BookSeriesEntryRow, type SeriesRow,
} from './schema';
import { withWriteLock } from './write-lock';

export type BookSeriesMemberWithSeries = {
  member: BookSeriesMemberRow;
  series: SeriesRow;
  /** True when the member series has ≥1 library file — i.e. an actually-owned,
   *  readable book rather than a monitored-but-undownloaded placeholder. */
  hasFiles: boolean;
};
export type BookSeriesDetail = {
  bookSeries: BookSeriesRow;
  members: BookSeriesMemberWithSeries[];
  entries: BookSeriesEntryRow[];
};

export async function createBookSeries(input: {
  name: string; contentType: ContentType; source: BookSeriesRow['source'];
  description?: string | null; coverUrl?: string | null; totalBooks?: number | null;
  externalId?: string | null; externalIdsJson?: string | null;
}): Promise<BookSeriesRow> {
  return withWriteLock(async () => {
    const [row] = await getDb().insert(bookSeries).values({
      name: input.name, contentType: input.contentType, source: input.source,
      description: input.description ?? null, coverUrl: input.coverUrl ?? null,
      totalBooks: input.totalBooks ?? null, externalId: input.externalId ?? null,
      externalIdsJson: input.externalIdsJson ?? null,
    }).returning();
    if (!row) throw new Error('createBookSeries: insert returned no row');
    return row;
  });
}

export async function getBookSeries(id: number): Promise<BookSeriesDetail | null> {
  const [bs] = await getDb().select().from(bookSeries).where(eq(bookSeries.id, id));
  if (!bs) return null;
  const memberRows = await getDb()
    .select({ member: bookSeriesMembers, series })
    .from(bookSeriesMembers)
    .innerJoin(series, eq(series.id, bookSeriesMembers.seriesId))
    .where(eq(bookSeriesMembers.bookSeriesId, id));
  memberRows.sort((a, b) => {
    const pa = a.member.position ?? Number.POSITIVE_INFINITY;
    const pb = b.member.position ?? Number.POSITIVE_INFINITY;
    return pa !== pb ? pa - pb : a.series.id - b.series.id;
  });
  // Which member series actually own ≥1 file. "owned" in the merged view
  // requires a real file, not just a linked series row — a monitored book with
  // no download yet is not owned. One batched query, no N+1.
  const memberSeriesIds = memberRows.map((m) => m.series.id);
  const seriesWithFiles = memberSeriesIds.length
    ? await getDb()
        .select({ seriesId: libraryFiles.seriesId })
        .from(libraryFiles)
        .where(inArray(libraryFiles.seriesId, memberSeriesIds))
        .groupBy(libraryFiles.seriesId)
    : [];
  const ownedSet = new Set(seriesWithFiles.map((r) => r.seriesId));
  const members: BookSeriesMemberWithSeries[] = memberRows.map((m) => ({
    ...m,
    hasFiles: ownedSet.has(m.series.id),
  }));
  const entries = await getDb().select().from(bookSeriesEntries)
    .where(eq(bookSeriesEntries.bookSeriesId, id)).orderBy(asc(bookSeriesEntries.position));
  return { bookSeries: bs, members, entries };
}

export async function listBookSeries(
  opts: { contentType?: ContentType } = {},
): Promise<Array<BookSeriesRow & { memberCount: number }>> {
  const rows = opts.contentType
    ? await getDb().select().from(bookSeries).where(eq(bookSeries.contentType, opts.contentType))
    : await getDb().select().from(bookSeries);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const counts = await getDb()
    .select({ id: bookSeriesMembers.bookSeriesId, c: sql<number>`count(*)` })
    .from(bookSeriesMembers)
    .where(inArray(bookSeriesMembers.bookSeriesId, ids))
    .groupBy(bookSeriesMembers.bookSeriesId);
  const byId = new Map(counts.map((c) => [c.id, Number(c.c)]));

  // For sagas whose own coverUrl is null, fall back to the first member's
  // series.coverUrl (same ordering getBookSeries uses: position nulls-last,
  // then series.id ascending). One batched query — no N+1.
  const nullCoverIds = rows.filter((r) => r.coverUrl === null).map((r) => r.id);
  const firstMemberCover = new Map<number, string | null>();
  if (nullCoverIds.length > 0) {
    // Fetch all members for the null-cover sagas with their covers, then pick
    // the first one per saga in application code (replicating the sort used in
    // getBookSeries: position nulls-last, then series.id).
    const memberRows = await getDb()
      .select({
        bookSeriesId: bookSeriesMembers.bookSeriesId,
        position: bookSeriesMembers.position,
        seriesId: series.id,
        coverUrl: series.coverUrl,
      })
      .from(bookSeriesMembers)
      .innerJoin(series, eq(series.id, bookSeriesMembers.seriesId))
      .where(inArray(bookSeriesMembers.bookSeriesId, nullCoverIds));

    // Group by bookSeriesId and sort to find the first member.
    const grouped = new Map<number, typeof memberRows>();
    for (const m of memberRows) {
      const arr = grouped.get(m.bookSeriesId) ?? [];
      arr.push(m);
      grouped.set(m.bookSeriesId, arr);
    }
    for (const [bsId, members] of grouped) {
      members.sort((a, b) => {
        const pa = a.position ?? Number.POSITIVE_INFINITY;
        const pb = b.position ?? Number.POSITIVE_INFINITY;
        return pa !== pb ? pa - pb : a.seriesId - b.seriesId;
      });
      firstMemberCover.set(bsId, members[0]?.coverUrl ?? null);
    }
  }

  return rows.map((r) => ({
    ...r,
    coverUrl: r.coverUrl ?? firstMemberCover.get(r.id) ?? null,
    memberCount: byId.get(r.id) ?? 0,
  }));
}

export async function listAllMemberships(): Promise<Array<{ bookSeriesId: number; seriesId: number }>> {
  const rows = await getDb()
    .select({ bookSeriesId: bookSeriesMembers.bookSeriesId, seriesId: bookSeriesMembers.seriesId })
    .from(bookSeriesMembers);
  return rows;
}

export async function getBookSeriesForTitle(
  seriesId: number,
): Promise<(BookSeriesRow & { memberCount: number }) | null> {
  const [m] = await getDb().select().from(bookSeriesMembers)
    .where(eq(bookSeriesMembers.seriesId, seriesId)).limit(1);
  if (!m) return null;
  const [bs] = await getDb().select().from(bookSeries).where(eq(bookSeries.id, m.bookSeriesId));
  if (!bs) return null;
  const [countRow] = await getDb()
    .select({ c: sql<number>`count(*)` })
    .from(bookSeriesMembers)
    .where(eq(bookSeriesMembers.bookSeriesId, m.bookSeriesId));
  return { ...bs, memberCount: Number(countRow?.c ?? 0) };
}

export async function addMember(
  bookSeriesId: number, seriesId: number,
  opts: { position?: number | null; linkSource: 'manual' | 'auto' },
): Promise<void> {
  return withWriteLock(async () => {
    const [bs] = await getDb().select().from(bookSeries).where(eq(bookSeries.id, bookSeriesId));
    if (!bs) throw new Error(`book_series ${bookSeriesId} does not exist`);
    const [s] = await getDb().select().from(series).where(eq(series.id, seriesId));
    if (!s) throw new Error(`series ${seriesId} does not exist`);
    if (s.contentType !== bs.contentType) throw new Error('content type mismatch');
    const [existing] = await getDb().select().from(bookSeriesMembers)
      .where(and(eq(bookSeriesMembers.bookSeriesId, bookSeriesId),
        eq(bookSeriesMembers.seriesId, seriesId)));
    if (existing) {
      // Never downgrade manual→auto; also do not overwrite a manually-set
      // position from an auto call — only a manual call may change position.
      const linkSource = existing.linkSource === 'manual' ? 'manual' : opts.linkSource;
      const position =
        existing.linkSource === 'manual' && opts.linkSource === 'auto'
          ? existing.position
          : opts.position !== undefined
            ? opts.position
            : existing.position;
      await getDb().update(bookSeriesMembers)
        .set({ position, linkSource })
        .where(eq(bookSeriesMembers.id, existing.id));
      return;
    }
    await getDb().insert(bookSeriesMembers).values({
      bookSeriesId, seriesId, position: opts.position ?? null, linkSource: opts.linkSource,
    });
  });
}

export async function removeMember(bookSeriesId: number, seriesId: number): Promise<void> {
  await withWriteLock(() => getDb().delete(bookSeriesMembers).where(and(
    eq(bookSeriesMembers.bookSeriesId, bookSeriesId), eq(bookSeriesMembers.seriesId, seriesId))));
}

export async function setMemberPosition(
  bookSeriesId: number, seriesId: number, position: number | null,
): Promise<void> {
  await withWriteLock(() => getDb().update(bookSeriesMembers).set({ position }).where(and(
    eq(bookSeriesMembers.bookSeriesId, bookSeriesId), eq(bookSeriesMembers.seriesId, seriesId))));
}

export async function updateBookSeries(
  id: number,
  patch: Partial<Pick<BookSeriesRow,
    'name' | 'description' | 'coverUrl' | 'totalBooks' | 'externalId' | 'externalIdsJson'>>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await withWriteLock(() => getDb().update(bookSeries)
    .set({ ...patch, updatedAt: new Date() }).where(eq(bookSeries.id, id)));
}

export async function deleteBookSeries(id: number): Promise<void> {
  await withWriteLock(() => getDb().delete(bookSeries).where(eq(bookSeries.id, id)));
}

export async function replaceEntries(
  bookSeriesId: number,
  entries: Array<{ position?: number | null; title: string; externalRef?: string | null; coverUrl?: string | null }>,
): Promise<void> {
  return withWriteLock(async () => {
    await getDb().delete(bookSeriesEntries).where(eq(bookSeriesEntries.bookSeriesId, bookSeriesId));
    if (entries.length === 0) return;
    await getDb().insert(bookSeriesEntries).values(entries.map((e) => ({
      bookSeriesId, position: e.position ?? null, title: e.title,
      externalRef: e.externalRef ?? null, coverUrl: e.coverUrl ?? null,
    })));
  });
}
