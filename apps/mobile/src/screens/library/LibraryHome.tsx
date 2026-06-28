import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Linking,
  TextInput,
  Pressable,
  BackHandler,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NavigationProp } from '@react-navigation/native';
import {
  Filter,
  Search,
  LibraryBig,
  ArrowLeft,
  FolderPlus,
  Info,
  CloudOff,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppBar } from '@/components/AppBar';
import { IconButton } from '@/components/IconButton';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Cover } from '@/components/Cover';
import { ContentTypePill } from '@/components/Pill';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import {
  useLibrary,
  useLibrarySummary,
  useUpdateAvailable,
  useDownloads,
  useLibraryGroups,
} from '@/api/hooks';
import { useBookSeriesMemberMap } from '@/api/hooks/useBookSeries';
import { GridCard } from '@/features/library/GridCard';
import { ListRow } from '@/features/library/ListRow';
import { FilterChipRow } from '@/features/library/FilterChipRow';
import { GroupRow } from '@/features/library/groups/GroupRow';
import { FolderCard } from '@/features/library/groups/FolderCard';
import { BookSeriesRow } from '@/features/library/BookSeriesRow';
import { BookSeriesCard } from '@/features/library/BookSeriesCard';
import { GroupCrumbsBar } from '@/features/library/groups/GroupCrumbsBar';
import {
  GroupDndProvider,
  DropTarget,
  SeriesDragSource,
} from '@/features/library/groups/GroupDndProvider';
import { MoveToGroupSheet } from '@/features/library/groups/MoveToGroupSheet';
import { CreateGroupSheet } from '@/features/library/groups/CreateGroupSheet';
import { GroupActionsSheet } from '@/features/library/groups/GroupActionsSheet';
import { RenameGroupSheet } from '@/features/library/groups/RenameGroupSheet';
import { DeleteGroupConfirmSheet } from '@/features/library/groups/DeleteGroupConfirmSheet';
import {
  childrenOf,
  descendantGroupIds,
  displayPath,
  seriesUnderGroup,
  type GroupNode,
} from '@/features/library/groups/lib';
import { UpdateBanner } from '@/features/updates/UpdateBanner';
import { NetworkErrorScreen } from '@/features/system/NetworkErrorScreen';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { useOfflineLibrarySeries } from '@/features/system/offlineContent';
import { ChangelogTrigger } from '@/features/updates/ChangelogTrigger';
import { applyLibraryFilters } from '@/features/library/applyFilters';
import { useLibraryFilter, type LibrarySort } from '@/state/libraryFilterStore';
import { useLayout } from '@/responsive/useLayout';
import type { LibraryStackParamList, AppTabsParamList } from '@/navigation/types';
import type { SeriesSummary } from '@/api/schemas';

// Mono section eyebrow per the design (library-groups-screens.jsx:84-86):
// `GROUPS · n`, `IN THIS GROUP · n`, `UNGROUPED · n`.
function SectionLabel({ label, n }: { label: string; n: number }) {
  const t = useTokens();
  return (
    <Text
      style={{
        paddingHorizontal: 14,
        marginTop: 4,
        marginBottom: 10,
        fontFamily: fonts.mono.regular,
        fontSize: 10.5,
        letterSpacing: 1.26, // 0.12em × 10.5px
        color: t.textMuted,
      }}
    >
      {label} · {n}
    </Text>
  );
}

function sortRows(rows: SeriesSummary[], sort: LibrarySort): SeriesSummary[] {
  if (sort === 'volumes:desc') {
    return [...rows].sort((a, b) => b.volumes - a.volumes);
  }
  if (sort === 'progress:asc') {
    // Sort by download ratio ascending (least progress first)
    const ratio = (s: SeriesSummary) => (s.volumes > 0 ? s.downloaded / s.volumes : 1);
    return [...rows].sort((a, b) => ratio(a) - ratio(b));
  }
  // API already sorted for the other keys; return as-is.
  return rows;
}

export default function Library() {
  const t = useTokens();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Group browse position: null = library root, otherwise the open group's id.
  const [path, setPath] = useState<number | null>(null);
  const filter = useLibraryFilter();
  // Map client sort keys to the subset the API understands. New client-only keys
  // fall back to added_at:desc; sorting is then applied client-side below.
  const apiSort: 'added_at:desc' | 'added_at:asc' | 'title:asc' =
    filter.sort === 'volumes:desc' || filter.sort === 'progress:asc'
      ? 'added_at:desc'
      : filter.sort;
  const q = useLibrary({ page: 1, limit: 50, sort: apiSort, q: query.trim() || undefined });
  const groupsQ = useLibraryGroups();
  const { memberMap: bookSeriesMemberMap, bookSeriesList } = useBookSeriesMemberMap();
  const summary = useLibrarySummary();
  const update = useUpdateAvailable();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const showBanner = update.available && !bannerDismissed && update.serverCurrent !== null;
  const downloads = useDownloads();
  const layout = useLayout();
  const online = useIsOnline();
  const { gate } = useOnlineGate();
  const offlineSeries = useOfflineLibrarySeries();
  const numCols =
    layout.class === 'tablet-landscape' ? 6 : layout.class === 'tablet-portrait' ? 4 : 2;

  // Build a map of seriesId → download progress (0–1) for active downloads.
  const liveProgressBySeriesId = new Map<number, number>();
  for (const d of downloads.data?.downloads ?? []) {
    if (
      d.series !== null &&
      (d.status === 'downloading' || d.status === 'queued') &&
      d.progress != null
    ) {
      liveProgressBySeriesId.set(d.series.id, d.progress);
    }
  }

  const filteredRows = useMemo(() => {
    const rows = applyLibraryFilters(q.data?.rows ?? [], {
      contentTypes: filter.contentTypes,
      read: filter.read,
      mon: filter.mon,
      health: filter.health,
    });
    return sortRows(rows, filter.sort);
  }, [q.data?.rows, filter.contentTypes, filter.read, filter.mon, filter.health, filter.sort]);

  // Browse mode = the screen's existing no-filter/no-search condition. Any
  // active facet/sort (filter.isFiltered, the same check the filter badge uses)
  // or a search query switches to flat mode, where the groups UI fully hides
  // and the existing grid/list of all matches renders unchanged.
  const browseMode = !filter.isFiltered() && query.trim().length === 0;
  const groups = groupsQ.data?.groups ?? [];
  // Resolve the open group from the live groups list — if it was deleted on the
  // server (or groups haven't loaded yet), fall back to the root view.
  const currentGroup = path !== null ? (groups.find((g) => g.id === path) ?? null) : null;
  const activePath = currentGroup?.id ?? null;
  const inGroup = browseMode && currentGroup !== null;
  const childGroups = browseMode ? childrenOf(groups, activePath) : [];
  // Series shown in browse mode: directly in the open group (or ungrouped at root).
  const memberRows = browseMode ? filteredRows.filter((s) => s.groupId === activePath) : [];
  const allRows = q.data?.rows ?? [];

  // In browse mode, collapse member titles into book-series cards so the
  // library grid mirrors the web's collapseForView behaviour. Emit one
  // book-series card per distinct book-series id; hide the individual member
  // series from the series list. The book-series card only appears when at
  // least one member is visible in the current group context (memberRows).
  //
  // When search/filter is active (browseMode === false) the flat list renders
  // unchanged — member titles surface individually, matching web behaviour.
  const { bookSeriesCards, standaloneRows } = useMemo(() => {
    if (!browseMode) return { bookSeriesCards: [], standaloneRows: memberRows };
    const emitted = new Set<number>();
    const cards: typeof bookSeriesList = [];
    const standalone: typeof memberRows = [];
    for (const s of memberRows) {
      const bsId = bookSeriesMemberMap.get(s.id);
      if (bsId !== undefined) {
        if (!emitted.has(bsId)) {
          const bs = bookSeriesList.find((b) => b.id === bsId);
          if (bs) {
            cards.push(bs);
            emitted.add(bsId);
          } else {
            // book series not found in list (shouldn't happen) — show as standalone
            standalone.push(s);
          }
        }
        // else already emitted — skip this member
      } else {
        standalone.push(s);
      }
    }
    return { bookSeriesCards: cards, standaloneRows: standalone };
  }, [browseMode, memberRows, bookSeriesMemberMap, bookSeriesList]);

  const rowsToRender = browseMode ? standaloneRows : filteredRows;

  // Android hardware back pops the group path (to the parent) before the
  // default behavior (leaving the screen) applies. There is no prior
  // hardware-back interception in the app, so this uses the standard RN
  // BackHandler subscription directly.
  const parentId = currentGroup?.parentId ?? null;
  useEffect(() => {
    if (!inGroup) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPath(parentId);
      return true;
    });
    return () => sub.remove();
  }, [inGroup, parentId]);

  // Group management sheets. createTarget doubles as the open flag so the
  // sheet can target the root (parentId null) and still be closed.
  const [createTarget, setCreateTarget] = useState<{ parentId: number | null } | null>(null);
  const [actionsGroup, setActionsGroup] = useState<GroupNode | null>(null);
  const [renameTarget, setRenameTarget] = useState<GroupNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GroupNode | null>(null);
  const onNewGroup = (newParentId: number | null) => setCreateTarget({ parentId: newParentId });

  // If the open path sat inside the deleted subtree, pop to the deleted
  // group's parent (groups here is the pre-invalidation snapshot, so the
  // descendant walk still sees the deleted nodes).
  const onGroupDeleted = (deletedParentId: number | null) => {
    if (
      path !== null &&
      deleteTarget !== null &&
      descendantGroupIds(groups, deleteTarget.id).has(path)
    ) {
      setPath(deletedParentId);
    }
  };

  // Long-press target for the Move-to-group sheet. Phones only: tablet
  // long-press is reserved for drag-and-drop — tablets reach the
  // sheet via the series detail's Group row instead.
  const [moveSeries, setMoveSeries] = useState<SeriesSummary | null>(null);
  const onSeriesLongPress = layout.isTablet ? undefined : (s: SeriesSummary) => setMoveSeries(s);

  // Tablet drag-and-drop: real drag of series covers onto folder cards /
  // breadcrumbs. The provider is inert on phones and in flat mode (no
  // groups UI → no drop targets). While a drag is live the grid's scroll is
  // locked so the measured drop frames stay valid.
  const dndEnabled = layout.isTablet && browseMode;
  const [dndDragging, setDndDragging] = useState(false);

  const rootSubtitle = summary.data
    ? `${summary.data.total} SERIES · ${summary.data.monitored} MONITORED · ${summary.data.missing} MISSING`
    : q.data
      ? `${q.data.total} SERIES · ${q.data.rows.filter((s) => s.monitored).length} MONITORED · ${q.data.rows.filter((s) => s.downloaded < s.volumes).length} MISSING`
      : '0 SERIES';
  const subtitle =
    inGroup && currentGroup
      ? `${displayPath(groups, currentGroup.id).toUpperCase()} · ${seriesUnderGroup(allRows, groups, currentGroup.id).length} SERIES`
      : rootSubtitle;

  if (online && q.isLoading) {
    return (
      <ScreenContainer testID={`screen-library-${filter.view}`}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={{ width: '47%' }}>
                <Skeleton variant="card" />
              </View>
            ))}
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Online error with no cached data: the blocking retry screen.
  if (online && q.isError && !q.data) {
    return <NetworkErrorScreen cachedCount={0} onRetry={() => q.refetch()} />;
  }

  // Offline with no cached library data: the query is paused (no error, never
  // resolves), so neither the skeleton nor the online error branch can run.
  // Surface the downloaded-series grid (or an empty state) instead so the user
  // can still reach what they've saved.
  if (!online && !q.data) {
    return (
      <ScreenContainer testID={`screen-library-${filter.view}`}>
        <AppBar
          large
          title="Library"
          subtitle={`DOWNLOADED · ${offlineSeries.length}`}
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <IconButton
                testID="btn-search"
                accessibilityLabel="Search library"
                onPress={() => {
                  setSearchOpen((open) => {
                    if (open) setQuery('');
                    return !open;
                  });
                }}
              >
                <Search size={18} color={searchOpen ? t.primary : t.textMuted} strokeWidth={1.75} />
              </IconButton>
              <IconButton
                testID="btn-filter"
                accessibilityLabel="Filter"
                onPress={gate(() => navigation.navigate('FilterSheet'))}
                badge={filter.isFiltered()}
              >
                <Filter
                  size={18}
                  color={filter.isFiltered() ? t.primary : t.textMuted}
                  strokeWidth={1.75}
                />
              </IconButton>
            </View>
          }
        />
        {offlineSeries.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}
          >
            <EmptyState
              variant="primary"
              icon={CloudOff}
              title="No downloaded series"
              body="Download volumes while you're online to read them offline."
            />
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
            <Text
              style={{
                paddingHorizontal: 14,
                marginBottom: 10,
                fontFamily: fonts.mono.regular,
                fontSize: 10.5,
                letterSpacing: 1.26,
                color: t.textMuted,
              }}
            >
              DOWNLOADED · {offlineSeries.length}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 }}>
              {offlineSeries.map((r) => (
                <View
                  key={r.readableKey}
                  style={{ width: `${100 / numCols}%`, paddingHorizontal: 4, marginBottom: 16 }}
                >
                  <Pressable
                    testID={`offline-series-${r.readableKey}`}
                    accessibilityRole="button"
                    onPress={() =>
                      r.seriesId != null
                        ? navigation.navigate('SeriesOverview', { seriesId: String(r.seriesId) })
                        : undefined
                    }
                  >
                    <Cover uri={r.coverUrl} hue={r.hue} title={r.title}>
                      <View style={{ position: 'absolute', top: 7, left: 7 }}>
                        <ContentTypePill type={r.contentType} size="xs" />
                      </View>
                    </Cover>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: fonts.sans.medium,
                        fontSize: 12.5,
                        color: t.text,
                        marginTop: 6,
                      }}
                    >
                      {r.title}
                    </Text>
                    <Text
                      style={{
                        fontFamily: fonts.mono.regular,
                        fontSize: 9,
                        letterSpacing: 0.4,
                        color: t.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {r.volumeCount} {r.volumeCount === 1 ? 'VOLUME' : 'VOLUMES'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </ScreenContainer>
    );
  }

  // In browse mode an empty filteredRows just means every series lives in a
  // group (or the open group is empty) — the groups UI still renders. The
  // whole-library empty state only applies when there are no groups either.
  //
  // When a search or filter is active (browseMode === false), an empty result
  // must NOT take this full-screen branch: it has no AppBar, so it would hide
  // the search field and filter button and leave no way to clear the query
  // (you had to restart the app). Instead we fall through to the normal render
  // and show an inline "no matches" message below the still-visible controls.
  if (filteredRows.length === 0 && !q.isLoading && browseMode && groups.length === 0) {
    return (
      <ScreenContainer testID={`screen-library-${filter.view}`}>
        {/* Pull-to-refresh works on the empty state too, so you can re-check for
            newly added/synced series without leaving the screen. flexGrow keeps
            the empty card centered while still allowing the drag gesture. */}
        <ScrollView
          contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching}
              onRefresh={() => q.refetch()}
              tintColor={t.primary}
            />
          }
        >
          <EmptyState
            variant="primary"
            icon={LibraryBig}
            title="Your library is empty"
            body="Add your first series and bookkeeprr will monitor releases."
            actionLabel="Add series"
            onAction={gate(() => navigation.navigate('AddSeries'))}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer testID={`screen-library-${filter.view}`}>
      <GroupDndProvider enabled={dndEnabled} onDraggingChange={setDndDragging}>
        <ChangelogTrigger />
        <AppBar
          large
          title={inGroup && currentGroup ? currentGroup.name : 'Library'}
          subtitle={subtitle}
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {layout.isTablet && browseMode ? (
                <Pressable
                  testID="btn-new-group"
                  accessibilityRole="button"
                  accessibilityLabel="New group"
                  onPress={gate(() => onNewGroup(activePath))}
                  style={{
                    height: 36,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                    backgroundColor: t.surface,
                    borderWidth: 1,
                    borderColor: t.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <FolderPlus size={15} color={t.text} strokeWidth={1.7} />
                  <Text
                    style={{
                      fontFamily: fonts.sans.medium,
                      fontSize: 13,
                      fontWeight: '500',
                      color: t.text,
                    }}
                  >
                    New group
                  </Text>
                </Pressable>
              ) : null}
              <IconButton
                testID="btn-search"
                accessibilityLabel="Search library"
                onPress={() => {
                  setSearchOpen((open) => {
                    if (open) setQuery('');
                    return !open;
                  });
                }}
              >
                <Search size={18} color={searchOpen ? t.primary : t.textMuted} strokeWidth={1.75} />
              </IconButton>
              <IconButton
                testID="btn-filter"
                accessibilityLabel="Filter"
                onPress={gate(() => navigation.navigate('FilterSheet'))}
                badge={filter.isFiltered()}
              >
                <Filter
                  size={18}
                  color={filter.isFiltered() ? t.primary : t.textMuted}
                  strokeWidth={1.75}
                />
              </IconButton>
            </View>
          }
        />
        {searchOpen ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 40,
              paddingHorizontal: 12,
              marginHorizontal: 14,
              marginBottom: 8,
              borderRadius: 10,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
            }}
          >
            <Search size={16} color={t.textMuted} strokeWidth={1.75} />
            <TextInput
              testID="input-library-search"
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search your library…"
              placeholderTextColor={t.textMuted}
              style={{
                flex: 1,
                color: t.text,
                fontFamily: fonts.sans.regular,
                fontSize: 14,
                padding: 0,
              }}
            />
          </View>
        ) : null}
        {inGroup && currentGroup && layout.isTablet ? (
          <GroupCrumbsBar groups={groups} currentId={currentGroup.id} onNavigate={setPath} />
        ) : inGroup ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
            <Pressable
              testID="group-back-chip"
              onPress={() => setPath(parentId)}
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 32,
                paddingLeft: 8,
                paddingRight: 12,
                borderRadius: 999,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.border,
              }}
            >
              <ArrowLeft size={14} color={t.text} strokeWidth={1.75} />
              <Text
                style={{
                  fontFamily: fonts.sans.medium,
                  fontSize: 12.5,
                  fontWeight: '500',
                  color: t.text,
                }}
              >
                {parentId !== null
                  ? (groups.find((g) => g.id === parentId)?.name ?? 'Library')
                  : 'Library'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <FilterChipRow rows={q.data?.rows ?? []} />
        )}
        <ScrollView
          scrollEnabled={!dndDragging}
          refreshControl={
            <RefreshControl
              refreshing={q.isFetching}
              onRefresh={() => q.refetch()}
              tintColor={t.primary}
            />
          }
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
        >
          {showBanner ? (
            <UpdateBanner
              mobile={update.mobile}
              serverCurrent={update.serverCurrent!}
              onInstall={() =>
                Linking.openURL('https://github.com/paulcsiki/bookkeeprr-mobile/releases').catch(
                  () => {
                    /* best-effort — external link */
                  },
                )
              }
              onOpenChangelog={() =>
                navigation
                  .getParent<NavigationProp<AppTabsParamList>>()
                  ?.navigate('Settings', { screen: 'VersionHistory' })
              }
              onDismiss={() => setBannerDismissed(true)}
            />
          ) : null}
          {browseMode && layout.isTablet ? (
            // Tablet browse: folder CARDS + book-series CARDS in the grid before
            // the series cells (per TabLibraryGroups); the phone row section + ghost
            // row are replaced by the top-bar "New group" button. Each folder card
            // is a measured drop target for the drag-and-drop provider.
            <>
              {!inGroup && (childGroups.length > 0 || bookSeriesCards.length > 0) ? (
                <Text
                  style={{
                    paddingHorizontal: 14,
                    marginTop: 4,
                    marginBottom: 10,
                    fontFamily: fonts.mono.regular,
                    fontSize: 10.5,
                    letterSpacing: 1.26, // 0.12em × 10.5px
                    color: t.textMuted,
                  }}
                >
                  GROUPS · {childGroups.length} — UNGROUPED · {standaloneRows.length} · DRAG COVERS ONTO
                  FOLDERS
                </Text>
              ) : null}
              {childGroups.length > 0 || bookSeriesCards.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 }}>
                  {childGroups.map((g) => (
                    <View key={g.id} style={{ width: `${100 / numCols}%`, paddingHorizontal: 4 }}>
                      <DropTarget id={`group-${g.id}`}>
                        {(hot) => (
                          <FolderCard
                            group={g}
                            fanSeries={seriesUnderGroup(allRows, groups, g.id)
                              .slice(0, 3)
                              .map((s) => ({ id: s.id, coverUrl: s.coverUrl }))}
                            dropState={hot ? 'hot' : 'idle'}
                            onPress={() => setPath(g.id)}
                            onLongPress={() => setActionsGroup(g)}
                          />
                        )}
                      </DropTarget>
                    </View>
                  ))}
                  {bookSeriesCards.map((bs) => (
                    <View
                      key={`bs-${bs.id}`}
                      style={{ width: `${100 / numCols}%`, paddingHorizontal: 4 }}
                    >
                      <BookSeriesCard
                        bookSeries={bs}
                        onPress={() =>
                          navigation.navigate('BookSeriesDetail', {
                            bookSeriesId: String(bs.id),
                          })
                        }
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
          {browseMode && !layout.isTablet ? (
            <>
              {childGroups.length > 0 ? (
                <>
                  <SectionLabel label="GROUPS" n={childGroups.length} />
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderBottomWidth: 1,
                      borderColor: t.border,
                      marginBottom: 16,
                    }}
                  >
                    {childGroups.map((g, i) => (
                      <View
                        key={g.id}
                        style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}
                      >
                        <GroupRow
                          group={g}
                          fanSeries={seriesUnderGroup(allRows, groups, g.id)
                            .slice(0, 2)
                            .map((s) => ({ id: s.id, coverUrl: s.coverUrl }))}
                          onPress={() => setPath(g.id)}
                          onLongPress={() => setActionsGroup(g)}
                          testID={`group-row-${g.id}`}
                        />
                      </View>
                    ))}
                    <Pressable
                      testID="new-group-row"
                      onPress={gate(() => onNewGroup(activePath))}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderTopWidth: 1,
                        borderTopColor: t.border,
                      }}
                    >
                      <View style={{ width: 46, alignItems: 'center' }}>
                        <FolderPlus size={19} color={t.primary} strokeWidth={1.7} />
                      </View>
                      <Text
                        style={{ fontFamily: fonts.sans.medium, fontSize: 14, color: t.primary }}
                      >
                        New group…
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable
                  testID="new-group-row"
                  onPress={gate(() => onNewGroup(activePath))}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    marginBottom: 16,
                  }}
                >
                  <View style={{ width: 46, alignItems: 'center' }}>
                    <FolderPlus size={19} color={t.primary} strokeWidth={1.7} />
                  </View>
                  <Text style={{ fontFamily: fonts.sans.medium, fontSize: 14, color: t.primary }}>
                    New group…
                  </Text>
                </Pressable>
              )}
              {/* Book-series rows: appear when member titles are present in this view.
                  Shown below groups, above individual series — mirrors the groups pattern. */}
              {bookSeriesCards.length > 0 ? (
                <>
                  <SectionLabel label="BOOK SERIES" n={bookSeriesCards.length} />
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderBottomWidth: 1,
                      borderColor: t.border,
                      marginBottom: 16,
                    }}
                  >
                    {bookSeriesCards.map((bs, i) => (
                      <View
                        key={`bs-${bs.id}`}
                        style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}
                      >
                        <BookSeriesRow
                          bookSeries={bs}
                          onPress={() =>
                            navigation.navigate('BookSeriesDetail', {
                              bookSeriesId: String(bs.id),
                            })
                          }
                          testID={`book-series-row-${bs.id}`}
                        />
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}
          {inGroup && childGroups.length === 0 && memberRows.length === 0 ? (
            <View
              style={{
                marginHorizontal: 14,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: t.border,
                borderRadius: 12,
                paddingVertical: 40,
                paddingHorizontal: 20,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: fonts.display.semibold, fontSize: 16, color: t.text }}>
                This group is empty
              </Text>
              <Text
                style={{
                  fontFamily: fonts.sans.regular,
                  fontSize: 12.5,
                  color: t.textMuted,
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {layout.isTablet
                  ? 'Drag covers here, or onto a breadcrumb to move them back out.'
                  : 'Long-press a series cover to move it here.'}
              </Text>
            </View>
          ) : !browseMode && rowsToRender.length === 0 ? (
            // Active search/filter with no matches. The AppBar (search field +
            // filter button) stays mounted above, so the query is still
            // editable/clearable — only the result area shows this message.
            <View
              testID="library-no-matches"
              style={{ paddingTop: 48, paddingHorizontal: 24, alignItems: 'center' }}
            >
              <Search size={28} color={t.textMuted} strokeWidth={1.5} />
              <Text
                style={{
                  fontFamily: fonts.display.semibold,
                  fontSize: 16,
                  color: t.text,
                  marginTop: 12,
                }}
              >
                No matches
              </Text>
              <Text
                style={{
                  fontFamily: fonts.sans.regular,
                  fontSize: 13,
                  color: t.textMuted,
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {query.trim().length > 0
                  ? `Nothing in your library matches “${query.trim()}”.`
                  : 'No series match the current filters.'}
              </Text>
            </View>
          ) : (
            <>
              {browseMode && !layout.isTablet ? (
                <SectionLabel
                  label={inGroup ? 'IN THIS GROUP' : 'UNGROUPED'}
                  n={standaloneRows.length}
                />
              ) : null}
              {filter.view === 'grid' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 }}>
                  {rowsToRender.map((s) => (
                    <View key={s.id} style={{ width: `${100 / numCols}%`, paddingHorizontal: 4 }}>
                      {/* SeriesDragSource renders children unchanged unless the
                        dnd provider is enabled (tablet browse mode). */}
                      <SeriesDragSource series={{ id: s.id, title: s.title, coverUrl: s.coverUrl, groupId: s.groupId }}>
                        <GridCard
                          series={s}
                          downloadProgress={liveProgressBySeriesId.get(s.id) ?? null}
                          onPress={() =>
                            navigation.navigate('SeriesOverview', { seriesId: String(s.id) })
                          }
                          onLongPress={onSeriesLongPress && (() => onSeriesLongPress(s))}
                        />
                      </SeriesDragSource>
                    </View>
                  ))}
                </View>
              ) : (
                <View>
                  {rowsToRender.map((s) => (
                    <SeriesDragSource
                      key={s.id}
                      series={{ id: s.id, title: s.title, coverUrl: s.coverUrl, groupId: s.groupId }}
                    >
                      <ListRow
                        series={s}
                        onPress={() =>
                          navigation.navigate('SeriesOverview', { seriesId: String(s.id) })
                        }
                        onLongPress={onSeriesLongPress && (() => onSeriesLongPress(s))}
                      />
                    </SeriesDragSource>
                  ))}
                </View>
              )}
            </>
          )}
          {browseMode && !layout.isTablet ? (
            <View
              style={{
                paddingTop: 16,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Info size={12} color={t.textMuted} strokeWidth={1.75} />
              <Text
                style={{
                  fontFamily: fonts.mono.regular,
                  fontSize: 10,
                  letterSpacing: 0.5, // 0.05em × 10px
                  color: t.textMuted,
                }}
              >
                LONG-PRESS A COVER · MOVE TO GROUP
              </Text>
            </View>
          ) : null}
          {/* Error with partial data (stale) is handled inline by the scroll view refresh. Full-page error is handled above. */}
        </ScrollView>
        {moveSeries !== null ? (
          <MoveToGroupSheet
            series={{
              id: moveSeries.id,
              title: moveSeries.title,
              coverUrl: moveSeries.coverUrl,
              groupId: moveSeries.groupId,
            }}
            visible
            onClose={() => setMoveSeries(null)}
          />
        ) : null}
        <GroupActionsSheet
          group={actionsGroup}
          visible={actionsGroup !== null}
          onClose={() => setActionsGroup(null)}
          onRename={() => {
            setRenameTarget(actionsGroup);
            setActionsGroup(null);
          }}
          onNewSubgroup={() => {
            if (actionsGroup !== null) setCreateTarget({ parentId: actionsGroup.id });
            setActionsGroup(null);
          }}
          onDelete={() => {
            setDeleteTarget(actionsGroup);
            setActionsGroup(null);
          }}
        />
        <CreateGroupSheet
          visible={createTarget !== null}
          parentId={createTarget?.parentId ?? null}
          groups={groups}
          onClose={() => setCreateTarget(null)}
        />
        <RenameGroupSheet
          group={renameTarget}
          visible={renameTarget !== null}
          onClose={() => setRenameTarget(null)}
        />
        <DeleteGroupConfirmSheet
          group={deleteTarget}
          groups={groups}
          visible={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onDeleted={onGroupDeleted}
        />
      </GroupDndProvider>
    </ScreenContainer>
  );
}
