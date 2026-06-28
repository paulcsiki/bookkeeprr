import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, ChevronLeft, CloudOff, Plus, Search, SearchX } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppBar } from '@/components/AppBar';
import { IconButton } from '@/components/IconButton';
import { Cover } from '@/components/Cover';
import { Pill } from '@/components/Pill';
import { RiffleLoader } from '@/components/RiffleLoader';
import { Chip, ChipRow } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { useLayout } from '@/responsive/useLayout';
import type { ContentType } from '@/api/schemas';
import { useDiscoverSources } from '@/api/hooks/useDiscoverSources';
import { useDiscoverSearch, type DiscoverResultItem } from '@/api/hooks/useDiscoverSearch';
import { useDiscoverBrowse } from '@/api/hooks/useDiscoverBrowse';
import { useDiscoverCategory } from '@/api/hooks/useDiscoverCategory';
import { useAddSeries } from '@/api/hooks/useAddSeries';
import { useQualityProfiles, defaultProfileId } from '@/api/hooks/useQualityProfiles';
import { buildAddBody } from '@/api/add-body';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { DiscoverDetailSheet } from './DiscoverDetailSheet';
import {
  BROWSE_ROWS,
  DLABEL,
  DTYPES,
  DSOURCES,
  type BrowseItem,
} from './fixtures';

type Mode = 'browse' | 'searching' | 'results' | 'category';
type Filter = 'all' | ContentType;

// A display tile with the extra fields needed to add the title and open the
// detail sheet. `source` + `sources` + `malId` are carried through from the
// API so the detail sheet can hit /api/discover/detail with correct params.
type DiscoverTileItem = BrowseItem & {
  coverUrl?: string | null;
  detail?: string | null;
  sourceId?: string;
  year?: number | null;
  /** API source identifier (e.g. 'anilist', 'mangadex', 'openlibrary'). */
  source?: string;
  /** Cross-linked provider ids (search results only). */
  sources?: DiscoverResultItem['sources'];
  /** MyAnimeList id (search results only). */
  malId?: number | null;
};

// Maps a DiscoverResultItem (API shape) to the display tile shape.
// Carries source/sources/malId so the detail sheet can call the detail endpoint.
function resultToBrowseItem(r: DiscoverResultItem): DiscoverTileItem {
  const hue: Record<ContentType, number> = {
    manga: 12,
    novel: 220,
    comic: 45,
    ebook: 160,
    audio: 290,
  };
  const item: DiscoverTileItem = {
    t: r.title,
    k: r.contentType,
    author: r.author ?? '',
    hue: hue[r.contentType] ?? 12,
    coverUrl: r.coverUrl,
    detail: r.detail,
    inLib: r.inLib,
    sourceId: r.sourceId,
    year: r.year,
    source: r.source,
    sources: r.sources,
    malId: r.malId ?? null,
  };
  if (r.isbn) item.isbn = r.isbn;
  return item;
}

// Tile shown both in the browse carousels and the 2-column results grid.
// Primary tap opens the detail sheet (onOpen). The + badge keeps a quick-add
// shortcut via onAdd. Long-press or a dedicated affordance is not needed —
// the primary UX is: tap → detail sheet → add from there.
function DiscoverCover({
  d,
  width,
  onOpen,
  onAdd,
  added = false,
  disabled = false,
}: {
  d: DiscoverTileItem;
  width: number | `${number}%`;
  onOpen?: () => void;
  onAdd?: () => void;
  added?: boolean;
  disabled?: boolean;
}) {
  const t = useTokens();
  // Prefer API coverUrl, fall back to OpenLibrary ISBN URL, fall back to gradient.
  const coverUri = d.coverUrl ?? (d.isbn ? `https://covers.openlibrary.org/b/isbn/${d.isbn}-M.jpg?default=false` : null);
  const inLib = d.inLib || added;
  return (
    <Pressable
      testID={`discover-add-${d.sourceId ?? d.t}`}
      onPress={onOpen}
      style={{ width, gap: 7 }}
    >
      <Cover uri={coverUri} hue={d.hue} title={d.t}>
        <View style={{ position: 'absolute', top: 7, left: 7, zIndex: 2 }}>
          <Pill kind={d.k} size="xs">
            {DLABEL[d.k]}
          </Pill>
        </View>
        {inLib ? (
          <View
            style={{
              position: 'absolute',
              top: 7,
              right: 7,
              zIndex: 2,
              width: 20,
              height: 20,
              borderRadius: 99,
              backgroundColor: withAlpha(t.coverBase, 0.55),
              borderWidth: 1,
              borderColor: t.onDarkBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={11} color={withAlpha(t.ok, 1)} strokeWidth={2.4} />
          </View>
        ) : (
          <Pressable
            testID={`discover-quickadd-${d.sourceId ?? d.t}`}
            onPress={onAdd}
            disabled={disabled || onAdd === undefined}
            hitSlop={6}
            style={{
              position: 'absolute',
              bottom: 7,
              right: 7,
              zIndex: 2,
              width: 26,
              height: 26,
              borderRadius: 8,
              backgroundColor: t.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.4 : 1,
            }}
          >
            <Plus size={14} color={t.primaryFg} strokeWidth={2.6} />
          </Pressable>
        )}
      </Cover>
      <View>
        <Text
          numberOfLines={1}
          style={{ fontFamily: fonts.sans.medium, fontSize: 12.5, color: t.text }}
        >
          {d.t}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 9,
            letterSpacing: 0.36,
            color: t.textMuted,
            textTransform: 'uppercase',
            marginTop: 2,
          }}
        >
          {d.author}
        </Text>
        {d.detail ? (
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fonts.mono.regular,
              fontSize: 8.5,
              letterSpacing: 0.3,
              color: t.textMuted,
              textTransform: 'uppercase',
              marginTop: 1,
              opacity: 0.7,
            }}
          >
            {d.detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function DiscoverHome() {
  const t = useTokens();
  const nav = useNavigation();
  const layout = useLayout();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();
  const cols = layout.isTablet ? (layout.isLandscape ? 5 : 4) : 2;
  const [mode, setMode] = useState<Mode>('browse');
  const [activeType, setActiveType] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  // The query/type that was submitted — drives the search API call.
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [submittedType, setSubmittedType] = useState<Filter>('all');
  // Real search results from the API.
  const [searchResults, setSearchResults] = useState<DiscoverTileItem[]>([]);

  // Detail sheet: the selected result (null = closed).
  const [detailResult, setDetailResult] = useState<DiscoverResultItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Optimistic "added" set keyed by sourceId so the tile flips to a check
  // immediately after adding from the detail sheet.
  // NOTE: useAddSeries is also used inside DiscoverDetailSheet; here we only
  // keep the optimistic state so tiles reflect the added state without a query
  // invalidation round-trip.
  const add = useAddSeries();
  const profilesQuery = useQualityProfiles();
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Opens the detail sheet for a tile item. Works for browse, category, and
  // search result tiles (search tiles carry source/sources/malId).
  const onOpenDetail = useCallback(
    (d: DiscoverTileItem) => {
      if (!d.sourceId) return;
      const result: DiscoverResultItem = {
        contentType: d.k,
        sourceId: d.sourceId,
        title: d.t,
        author: d.author || null,
        year: d.year ?? null,
        isbn: d.isbn ?? null,
        coverUrl: d.coverUrl ?? null,
        source: d.source ?? '',
        detail: d.detail ?? null,
        inLib: (d.inLib ?? false) || added.has(d.sourceId),
        sources: d.sources ?? null,
        malId: d.malId ?? null,
      };
      setDetailResult(result);
      setDetailOpen(true);
    },
    [added],
  );

  // Optimistic add callback from the detail sheet — flip the tile's added state.
  const onDetailAdded = useCallback((sourceId: string) => {
    setAdded((s) => new Set(s).add(sourceId));
    setDetailOpen(false);
  }, []);

  // Quick-add from a tile — uses the default quality profile silently.
  const onAddTile = useCallback(
    (d: DiscoverTileItem) => {
      if (!d.sourceId) return;
      const profileId = defaultProfileId(profilesQuery.data);
      if (profileId === undefined) return; // profiles not loaded yet — no-op
      const sid = d.sourceId;
      setAdded((s) => new Set(s).add(sid));
      add.mutate(
        buildAddBody(
          {
            contentType: d.k,
            sourceId: sid,
            title: d.t,
            author: d.author || null,
            year: d.year ?? null,
            isbn: d.isbn ?? null,
            coverUrl: d.coverUrl ?? null,
          },
          profileId,
        ),
        {
          onError: (err: unknown) => {
            setAdded((s) => {
              const n = new Set(s);
              n.delete(sid);
              return n;
            });
            Alert.alert("Couldn't add", err instanceof Error ? err.message : 'Please try again.');
          },
        },
      );
    },
    [add, profilesQuery.data],
  );

  // Cross-fade between the three states.
  const fade = useMemo(() => new Animated.Value(1), []);

  // -------------------------------------------------------------------------
  // Sources: dynamic count
  // -------------------------------------------------------------------------
  const sourcesQuery = useDiscoverSources();
  const configuredCount = sourcesQuery.data?.sources.filter((s) => s.configured).length
    ?? DSOURCES.length;

  // -------------------------------------------------------------------------
  // Search: real API call
  // -------------------------------------------------------------------------
  const searchQuery = useDiscoverSearch({
    query: submittedQuery,
    contentType: submittedType === 'all' ? 'all' : submittedType,
    enabled: mode === 'searching',
  });

  // Transition: searching → results when query resolves (success or error).
  useEffect(() => {
    if (mode !== 'searching') return;
    const resolved = searchQuery.isSuccess || searchQuery.isError;
    if (!resolved) return;
    const items = searchQuery.data ? searchQuery.data.results.map(resultToBrowseItem) : [];
    setSearchResults(items);
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    setMode('results');
  }, [mode, searchQuery.isSuccess, searchQuery.isError, searchQuery.data, fade]);

  const runSearch = useCallback(
    () => {
      const q = query.trim();
      if (!q) return;
      setSubmittedQuery(q);
      setSubmittedType(activeType);
      setActiveType('all');
      setMode('searching');
    },
    [query, activeType],
  );

  // Browse API: load the SELECTED content type's rows (defaulting to manga for
  // 'All'); the query re-runs when the chip changes. This is what lets Discover
  // show novels/comics/ebooks/audiobooks, not just manga.
  const browseApiQuery = useDiscoverBrowse(activeType === 'all' ? 'manga' : activeType);

  // "See all" for one browse row → a paginated category view (infinite scroll).
  const [categoryTarget, setCategoryTarget] = useState<{ rowId: string; label: string } | null>(null);
  const categoryType = activeType === 'all' ? 'manga' : (activeType as ContentType);
  const categoryQuery = useDiscoverCategory(
    categoryType,
    categoryTarget?.rowId ?? '',
    mode === 'category' && categoryTarget != null,
  );
  const categoryItems = useMemo<DiscoverTileItem[]>(() => {
    const hue: Record<ContentType, number> = { manga: 12, novel: 220, comic: 45, ebook: 160, audio: 290 };
    return (categoryQuery.data?.pages ?? []).flatMap((p) =>
      p.items.map((it) => {
        const tile: DiscoverTileItem = {
          t: it.title,
          k: it.contentType,
          author: it.author ?? '',
          hue: hue[it.contentType] ?? 12,
          coverUrl: it.coverUrl,
          detail: it.detail,
          inLib: it.inLib,
          sourceId: it.sourceId,
          year: it.year,
          source: it.source,
        };
        if (it.isbn) tile.isbn = it.isbn;
        return tile;
      }),
    );
  }, [categoryQuery.data]);
  const openCategory = useCallback((rowId: string, label: string) => {
    setCategoryTarget({ rowId, label });
    setMode('category');
  }, []);
  const activeBrowseRows = useMemo(() => {
    if (browseApiQuery.data) {
      return browseApiQuery.data.rows.map((row) => ({
        id: row.id,
        label: row.label,
        meta: row.meta,
        data: row.items.map((item): DiscoverTileItem => {
          const base: DiscoverTileItem = {
            t: item.title,
            k: item.contentType,
            author: item.author ?? '',
            hue: ({ manga: 12, novel: 220, comic: 45, ebook: 160, audio: 290 } as Record<string, number>)[item.contentType] ?? 12,
            coverUrl: item.coverUrl,
            detail: item.detail,
            inLib: item.inLib,
            sourceId: item.sourceId,
            year: item.year,
            source: item.source,
          };
          if (item.isbn) base.isbn = item.isbn;
          return base;
        }),
      }));
    }
    return BROWSE_ROWS.map((r) => ({
      ...r,
      data: r.data.map((d) => d as DiscoverTileItem),
    }));
  }, [browseApiQuery.data]);

  const shown = activeType === 'all' ? searchResults : searchResults.filter((r) => r.k === activeType);

  return (
    <ScreenContainer testID="screen-discover">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // The AppBar already accounts for the safe-area top (and ScreenContainer
        // wraps in SafeAreaView). Without this, iOS adds its own automatic
        // content inset on top, pushing the "Discover" header far down the
        // screen — misaligned vs Library, whose AppBar sits outside a ScrollView.
        contentInsetAdjustmentBehavior="never"
        scrollEventThrottle={16}
        onScroll={
          mode === 'category'
            ? (e) => {
                const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                const nearBottom =
                  layoutMeasurement.height + contentOffset.y >= contentSize.height - 600;
                if (
                  nearBottom &&
                  categoryQuery.hasNextPage &&
                  !categoryQuery.isFetchingNextPage
                ) {
                  void categoryQuery.fetchNextPage();
                }
              }
            : undefined
        }
      >
        <AppBar
          large
          title="Discover"
          subtitle={`ADD FROM ${configuredCount} SOURCES`}
          leading={
            <IconButton accessibilityLabel="Back" onPress={() => nav.goBack()} testID="discover-back">
              <ChevronLeft size={22} color={t.text} strokeWidth={2} />
            </IconButton>
          }
        />

        {/* Search field */}
        <View style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              height: 44,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
            }}
          >
            <Search size={16} color={t.textMuted} strokeWidth={2} />
            <TextInput
              testID="discover-search-input"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={gate(runSearch)}
              returnKeyType="search"
              placeholder="Search every source…"
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                flex: 1,
                color: t.text,
                fontFamily: fonts.sans.regular,
                fontSize: 14.5,
                padding: 0,
              }}
            />
            {mode !== 'browse' ? (
              <Pressable
                onPress={() => {
                  setQuery('');
                  setMode('browse');
                  setActiveType('all');
                }}
                hitSlop={8}
              >
                <Text
                  style={{
                    fontFamily: fonts.mono.medium,
                    fontSize: 10.5,
                    color: t.textMuted,
                    letterSpacing: 0.8,
                  }}
                >
                  CLEAR
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {mode === 'browse' || mode === 'results' ? (
          <ChipRow>
            <Chip
              testID="chip-all"
              active={activeType === 'all'}
              onPress={() => setActiveType('all')}
            >
              All
            </Chip>
            {DTYPES.map((dt) => (
              <Chip
                key={dt.k}
                testID={`chip-${dt.k}`}
                kind={dt.k}
                active={activeType === dt.k}
                onPress={() => setActiveType(dt.k)}
              >
                {dt.label}
              </Chip>
            ))}
          </ChipRow>
        ) : null}

        {mode === 'browse' ? (
          <Animated.View style={{ opacity: fade }}>
            {!online && !browseApiQuery.data ? (
              <View style={{ padding: 24 }}>
                <EmptyState
                  variant="muted"
                  icon={CloudOff}
                  title="You're offline"
                  body="Reconnect to browse Discover."
                />
              </View>
            ) : browseApiQuery.isLoading ? (
              <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                <RiffleLoader unit={64} />
              </View>
            ) : browseApiQuery.isError ? (
              <View style={{ padding: 24 }}>
                <EmptyState
                  variant="err"
                  icon={CloudOff}
                  title="Couldn't load Discover"
                  body="We couldn't reach the server. Check your connection and try again."
                  actionLabel="Try again"
                  onAction={() => void browseApiQuery.refetch()}
                />
              </View>
            ) : activeBrowseRows.length === 0 ? (
              <View style={{ padding: 24 }}>
                <EmptyState
                  variant="muted"
                  icon={SearchX}
                  title={`Nothing to browse in ${DLABEL[activeType === 'all' ? 'manga' : (activeType as ContentType)]}`}
                  body="Search above to find titles from the connected sources."
                />
              </View>
            ) : (
              <View>
                {activeBrowseRows.map((row) => (
                  <View key={row.id} style={{ marginTop: 14 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        paddingHorizontal: 16,
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.display.semibold,
                          fontSize: 16,
                          letterSpacing: -0.24,
                          color: t.text,
                        }}
                      >
                        {row.label}
                      </Text>
                      <Text
                        style={{
                          marginLeft: 8,
                          fontFamily: fonts.mono.medium,
                          fontSize: 9,
                          letterSpacing: 0.54,
                          color: t.textMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        {row.meta}
                      </Text>
                      <Pressable
                        testID={`see-all-${row.id}`}
                        onPress={gate(() => openCategory(row.id, row.label))}
                        hitSlop={8}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Text
                          style={{
                            fontFamily: fonts.mono.medium,
                            fontSize: 10,
                            letterSpacing: 0.6,
                            color: t.primary,
                            textTransform: 'uppercase',
                          }}
                        >
                          See all →
                        </Text>
                      </Pressable>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 4 }}
                    >
                      {row.data.map((d, i) => (
                        <DiscoverCover
                          key={i}
                          d={d}
                          width={118}
                          onOpen={gate(() => onOpenDetail(d))}
                          onAdd={gate(() => onAddTile(d))}
                          added={d.sourceId ? added.has(d.sourceId) : false}
                          disabled={disabledProps.disabled}
                        />
                      ))}
                    </ScrollView>
                  </View>
                ))}
                <View style={{ height: 20 }} />
              </View>
            )}
          </Animated.View>
        ) : null}

        {mode === 'category' && categoryTarget ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Pressable
                testID="category-back"
                onPress={() => {
                  setMode('browse');
                  setCategoryTarget(null);
                }}
                hitSlop={8}
              >
                <ChevronLeft size={20} color={t.text} strokeWidth={2} />
              </Pressable>
              <Text style={{ fontFamily: fonts.display.semibold, fontSize: 18, color: t.text }}>
                {categoryTarget.label}
              </Text>
            </View>
            {categoryQuery.isLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <RiffleLoader unit={56} caption={false} />
              </View>
            ) : categoryQuery.isError ? (
              <View style={{ padding: 24 }}>
                <EmptyState
                  variant="err"
                  icon={CloudOff}
                  title="Couldn't load this category"
                  body="We couldn't reach the server. Check your connection and try again."
                  actionLabel="Try again"
                  onAction={() => void categoryQuery.refetch()}
                />
              </View>
            ) : categoryItems.length === 0 ? (
              <View style={{ padding: 24 }}>
                <EmptyState
                  variant="muted"
                  icon={SearchX}
                  title="Nothing to show"
                  body="This category is empty right now."
                />
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -7 }}>
                  {categoryItems.map((d, i) => (
                    <View key={i} style={{ width: `${100 / cols}%`, padding: 7 }}>
                      <DiscoverCover
                        d={d}
                        width="100%"
                        onOpen={gate(() => onOpenDetail(d))}
                        onAdd={gate(() => onAddTile(d))}
                        added={d.sourceId ? added.has(d.sourceId) : false}
                        disabled={disabledProps.disabled}
                      />
                    </View>
                  ))}
                </View>
                {categoryQuery.isFetchingNextPage ? (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <RiffleLoader unit={40} caption={false} />
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {mode === 'searching' ? (
          <View
            testID="discover-loader"
            style={{
              paddingVertical: 40,
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 22,
            }}
          >
            <RiffleLoader unit={78} />
            <Text
              style={{
                fontFamily: fonts.mono.regular,
                fontSize: 10,
                color: t.textMuted,
                letterSpacing: 0.6,
                textAlign: 'center',
              }}
            >
              &quot;{submittedQuery}&quot;
            </Text>
          </View>
        ) : null}

        {mode === 'results' ? (
          <Animated.View style={{ opacity: fade, paddingHorizontal: 14, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 }}>
              <Text
                style={{
                  fontFamily: fonts.display.semibold,
                  fontSize: 15,
                  letterSpacing: -0.15,
                  color: t.text,
                }}
              >
                {shown.length}{' '}
                {activeType === 'all' ? 'results' : DLABEL[activeType as ContentType]}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  marginLeft: 'auto',
                  maxWidth: 180,
                  fontFamily: fonts.mono.regular,
                  fontSize: 9,
                  letterSpacing: 0.54,
                  color: t.textMuted,
                  textTransform: 'uppercase',
                }}
              >
                {submittedQuery}
              </Text>
            </View>
            {shown.length === 0 ? (
              <View style={{ padding: 24 }}>
                <EmptyState
                  variant="muted"
                  icon={SearchX}
                  title={`No matches for "${submittedQuery}"`}
                  body="Try clearing filters or widening the type."
                />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -7 }}>
                {shown.map((d, i) => (
                  <View
                    key={i}
                    style={{
                      width: `${100 / cols}%`,
                      padding: 7,
                    }}
                  >
                    <DiscoverCover
                      d={d}
                      width="100%"
                      onOpen={() => onOpenDetail(d)}
                      onAdd={() => onAddTile(d)}
                      added={d.sourceId ? added.has(d.sourceId) : false}
                    />
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        ) : null}

        {/* Bottom padding so the last row clears the tab bar. */}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Detail sheet — rendered outside the ScrollView so it overlays correctly. */}
      <DiscoverDetailSheet
        result={detailResult}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onAdded={onDetailAdded}
      />
    </ScreenContainer>
  );
}
