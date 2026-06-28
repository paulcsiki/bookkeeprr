import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getAcquisitionCounts,
  getSeriesDiskSizes,
  getSeriesHealth,
  listAllSeries,
} from '@/server/db/series';
import { getSeriesReadStates } from '@/server/db/reading-progress';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { groupCounts, listGroups } from '@/server/db/library-groups';
import { imageCacheSetting } from '@/server/db/settings/library';
import { listBookSeries, listAllMemberships } from '@/server/db/book-series';
import { LibraryView } from './LibraryView';
import type { ContentTypeFilterValue } from '@bookkeeprr/ui';
import type { GroupNode } from '@/components/library/groups/lib';

export const dynamic = 'force-dynamic';

const FILTER_VALUES = new Set<ContentTypeFilterValue>([
  'all',
  'manga',
  'comic',
  'light_novel',
  'ebook',
  'audiobook',
]);

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}): Promise<React.JSX.Element> {
  // Resolve the logged-in user (mirrors the dashboard page).
  const jar = await cookies();
  const token = jar.get('bookkeeprr_session')?.value ?? null;
  if (token === null) redirect('/login?next=/library');
  const session = await getSessionByToken(token);
  if (session === null) redirect('/login?next=/library');
  const user = await getUser(session.userId);
  if (user === null || user.disabled) redirect('/login?next=/library');

  const [rows, acquisitionRaw, sizesRaw, readStatesRaw, healthRaw, cacheSettings, bookSeriesRaw, membershipsRaw] =
    await Promise.all([
      listAllSeries(),
      getAcquisitionCounts(),
      getSeriesDiskSizes(),
      getSeriesReadStates(user.id),
      getSeriesHealth(),
      imageCacheSetting.get(),
      listBookSeries(),
      listAllMemberships(),
    ]);
  const acquisition = Array.from(acquisitionRaw.entries());
  const sizes = Array.from(sizesRaw.entries());
  const readStates = Array.from(readStatesRaw.entries());
  const health = Array.from(healthRaw.entries());
  const { enabled: cacheEnabled } = cacheSettings;

  // Library groups — rows + recursive counts + in-memory display paths (same
  // pathOf idiom as GET /api/library/groups: one query for the whole tree).
  const groupRows = await listGroups();
  const countsByGroup = await groupCounts();
  const groupById = new Map(groupRows.map((g) => [g.id, g]));
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
  const groups: GroupNode[] = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    parentId: g.parentId,
    path: pathOf(g.id),
    seriesCount: countsByGroup.get(g.id)?.seriesCount ?? 0,
    subgroupCount: countsByGroup.get(g.id)?.subgroupCount ?? 0,
  }));

  const { type } = await searchParams;
  const initialType: ContentTypeFilterValue =
    type && FILTER_VALUES.has(type as ContentTypeFilterValue)
      ? (type as ContentTypeFilterValue)
      : 'all';

  return (
    <div className="space-y-6">
      <LibraryView
        series={rows}
        groups={groups}
        acquisition={acquisition}
        sizes={sizes}
        readStates={readStates}
        health={health}
        initialType={initialType}
        cacheEnabled={cacheEnabled}
        bookSeriesList={bookSeriesRaw}
        memberships={membershipsRaw}
      />
    </div>
  );
}
