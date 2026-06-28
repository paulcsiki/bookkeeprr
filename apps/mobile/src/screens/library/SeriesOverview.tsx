import { useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  CloudOff,
  BookOpen,
  BookCopy,
  Folder,
  FileText,
} from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { EmptyState } from '@/components/EmptyState';
import { Pill } from '@/components/Pill';
import { Cover } from '@/components/Cover';
import { IconButton } from '@/components/IconButton';
import { StatusDot, StatusBadge } from '@/components/StatusDot';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { hueFromString } from '@/theme/color';
import { seriesStatus, volumeStatus, TYPE_LABEL } from '@/features/library/seriesMeta';
import { VolumeReadMark, ReadCheckBadge } from '@/features/library/VolumeReadMark';
import { volumeReaderParams, volumeActionLabel } from '@/features/library/volumeReader';
import { MoveToGroupSheet } from '@/features/library/groups/MoveToGroupSheet';
import { useSeries } from '@/api/hooks';
import { useContinueReading } from '@/api/hooks/useContinueReading';
import { useBookSeriesMemberMap } from '@/api/hooks/useBookSeries';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import { offlineReaderParams, useOfflineLibrarySeries } from '@/features/system/offlineContent';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { OfflineSection } from '@/features/system/OfflineSection';
import type { Volume } from '@/api/schemas';
import { useLayout } from '@/responsive/useLayout';
import { DETAIL_HERO_MAX_WIDTH } from '@/responsive/breakpoints';
import { SplitView } from '@/responsive/SplitView';
import type { LibraryStackParamList } from '@/navigation/types';

export default function SeriesOverview() {
  const route = useRoute<RouteProp<LibraryStackParamList, 'SeriesOverview'>>();
  const seriesId = route.params.seriesId;
  const id = Number(seriesId);
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const t = useTokens();
  const q = useSeries(id);
  const layout = useLayout();
  const { memberMap: bookSeriesMemberMap, bookSeriesList } = useBookSeriesMemberMap();
  const bookSeriesId = bookSeriesMemberMap.get(id) ?? null;
  const bookSeries = bookSeriesId !== null ? (bookSeriesList.find((b) => b.id === bookSeriesId) ?? null) : null;
  const online = useIsOnline();
  const { gate } = useOnlineGate();
  const offlineRow = useOfflineLibrarySeries().find((r) => r.seriesId === id) ?? null;
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const { data: continueData } = useContinueReading();
  const [moveOpen, setMoveOpen] = useState(false);

  if (online && q.isLoading)
    return (
      <ScreenContainer testID="screen-series-loading">
        <View style={{ flex: 1 }} />
      </ScreenContainer>
    );
  if (!q.data) {
    if (!online) {
      const volumes = offlineRow?.items ?? [];
      const list = (
        <View>
          <OfflineSection
            title={offlineRow?.title ?? 'Offline'}
            sub={
              volumes.length > 0
                ? 'Showing your downloaded volumes. Reconnect for full series details.'
                : 'No downloaded volumes for this title. Download them while online to read offline.'
            }
          />
          {volumes.map((v) => (
            <Pressable
              key={v.readableKey}
              testID={`offline-vol-${v.readableKey}`}
              accessibilityRole="button"
              onPress={() => navigation.navigate('Reader', offlineReaderParams(v.readableKey))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginHorizontal: 18,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: t.border,
              }}
            >
              <Text style={[text.label, { color: t.text, flex: 1 }]} numberOfLines={1}>
                {v.title}
              </Text>
              <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
            </Pressable>
          ))}
        </View>
      );
      if (layout.isLandscape) {
        return (
          <ScreenContainer testID="screen-series-overview">
            <SplitView
              testID="series-split"
              left={
                <ScrollView contentContainerStyle={{ padding: 24 }}>
                  <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                    <IconButton testID="btn-back-series" accessibilityLabel="Back" onPress={() => navigation.goBack()}>
                      <ChevronLeft size={22} color={t.text} strokeWidth={2} />
                    </IconButton>
                  </View>
                </ScrollView>
              }
              right={<ScrollView contentContainerStyle={{ paddingTop: 16 }}>{list}</ScrollView>}
            />
          </ScreenContainer>
        );
      }
      return (
        <ScreenContainer testID="screen-series-overview">
          <View style={{ flexDirection: 'row', paddingTop: 4 }}>
            <IconButton accessibilityLabel="Back" onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={t.text} strokeWidth={2} />
            </IconButton>
          </View>
          <ScrollView>{list}</ScrollView>
        </ScreenContainer>
      );
    }
    // Online (or still erroring online): the existing err EmptyState (Try again).
    return (
      <ScreenContainer testID="screen-series-error">
        <View style={{ flexDirection: 'row', paddingTop: 4 }}>
          <IconButton accessibilityLabel="Back" onPress={() => navigation.goBack()}>
            <ChevronLeft size={22} color={t.text} strokeWidth={2} />
          </IconButton>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            variant="err"
            icon={CloudOff}
            title="Couldn’t load this title"
            body="We couldn’t reach the server. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void q.refetch()}
          />
        </View>
      </ScreenContainer>
    );
  }

  const s = q.data;

  // --- Single-item detection (mirrors web's isSingleEbook / isSingleItem) ---
  // An audiobook is always a single item (no volume list needed).
  // An ebook with ≤1 volume is also a single item (Sabriel, etc.).
  // Multi-volume ebooks, manga, comics, and light novels keep the volumes panel.
  const isSingleEbook = s.contentType === 'ebook' && s.volumes <= 1;
  const isSingleItem = isSingleEbook || s.contentType === 'audio';
  // Show the right Volumes panel only for multi-volume series.
  const showVolumesPanel = !isSingleItem;

  // --- Hydration indicator ---
  // Use the real backend signal: `series.hydrating` is true while any background
  // job (metadata/volume hydrate, chapter sync, import) is still running for this
  // series. The useSeries hook polls at 4 s while true so the UI updates
  // automatically when enrichment finishes. Falls back to the isFetching proxy
  // when the field is absent (old servers).
  const isHydrating = q.data?.hydrating ?? (q.isFetching && !q.isRefetching);

  // In-progress readable for THIS series (not finished, partway through).
  const progressItem = (continueData?.items ?? []).find(
    (i) => i.seriesId === id && !i.finished && i.position > 0 && i.position < 0.999,
  );
  // First owned (imported) volume — the entry point for "Read now".
  const firstOwned = s.volumesList.find((v) => v.status === 'imported');
  const complete = s.volumes > 0 && s.downloaded >= s.volumes;

  // Reader params to open an owned volume from scratch. Audio opens by volumeId;
  // paged readables need the library file id.
  const readParamsForVolume = (v: Volume): LibraryStackParamList['Reader'] | null => {
    if (s.contentType === 'audio') return { volumeId: String(v.id) };
    return v.libraryFileId != null ? { fileId: String(v.libraryFileId) } : null;
  };

  // Primary CTA: resume if there's progress, else read the first owned volume,
  // else fall back to searching for releases. Releases are only worth surfacing
  // while volumes are still missing.
  const readParams = firstOwned ? readParamsForVolume(firstOwned) : null;
  // Audiobooks are listened to, not read — keep the CTA copy content-type aware.
  const isAudio = s.contentType === 'audio';
  const primary: { label: string; icon: typeof Search; onPress: () => void } = progressItem
    ? {
        label: isAudio ? 'Continue listening' : 'Continue reading',
        icon: BookOpen,
        onPress: () => navigation.navigate('Reader', offlineReaderParams(progressItem.readableKey)),
      }
    : readParams
      ? {
          label: isAudio ? 'Listen now' : 'Read now',
          icon: BookOpen,
          onPress: () => navigation.navigate('Reader', readParams),
        }
      : {
          label: 'Search now',
          icon: Search,
          onPress: gate(() => navigation.navigate('InteractiveSearch', { seriesId: String(id) })),
        };
  const showReleasesTab = !complete;

  const refreshControl = (
    <RefreshControl
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      tintColor={t.textMuted}
    />
  );

  // Group row (both form factors): shows where this series lives in the
  // library tree and opens the Move-to-group sheet. Mirrors the screen's
  // eyebrow-over-value stat idiom.
  const groupRow = (
    <Pressable
      testID="series-group-row"
      accessibilityRole="button"
      onPress={gate(() => setMoveOpen(true))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <Folder size={16} color={t.textMuted} strokeWidth={1.75} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9, letterSpacing: 1.2, color: t.textMuted }}>
          GROUP
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: fonts.sans.medium, fontSize: 13.5, color: t.text, marginTop: 3 }}
        >
          {s.groupPath || 'Library root'}
        </Text>
      </View>
      <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
    </Pressable>
  );

  // "Part of series" row — mirrors groupRow: icon + eyebrow + name + chevron.
  // Shown only when the title is a member of a book series. Navigates to the
  // BookSeriesDetail screen (registered by Task 18).
  const partOfSeriesRow =
    bookSeries !== null ? (
      <Pressable
        testID="part-of-series-row"
        accessibilityRole="button"
        onPress={() =>
          navigation.navigate('BookSeriesDetail', { bookSeriesId: String(bookSeries.id) })
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        }}
      >
        <BookCopy size={16} color={t.textMuted} strokeWidth={1.75} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ fontFamily: fonts.mono.regular, fontSize: 9, letterSpacing: 1.2, color: t.textMuted }}
          >
            SERIES
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.sans.medium, fontSize: 13.5, color: t.text, marginTop: 3 }}
          >
            {bookSeries.name}
          </Text>
        </View>
        <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
      </Pressable>
    ) : null;

  const moveSheet = moveOpen ? (
    <MoveToGroupSheet
      series={{ id, title: s.title, coverUrl: s.coverUrl, groupId: s.groupId }}
      visible
      onClose={() => setMoveOpen(false)}
    />
  ) : null;

  // The detail pane content is shared between the tablet (SplitView left) and
  // the phone layout. Extract it to avoid duplication.
  //
  // For single-item titles (ebook ≤1 volume, audiobook) this pane shows:
  //   - status badge row (owned/missing + monitored) on the book
  //   - synopsis / metadata
  //   - part-of-series row (always visible — not hidden with the volumes panel)
  // The right Volumes panel is omitted for single items; in tablet mode the left
  // pane stretches to full width via a plain View instead of SplitView.

  // Inline status row for single-item titles: shows the volume's status and
  // the monitored flag so the user knows whether the item is owned or missing.
  const singleItemStatusBadge = isSingleItem ? (() => {
    const vol = s.volumesList[0];
    const kind = vol ? volumeStatus(vol.status) : seriesStatus(s);
    const owned = s.downloaded > 0;
    const label = owned ? 'OWNED' : 'MISSING';
    return (
      <View
        testID="series-status-badge"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 14,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.surfaceMuted,
        }}
      >
        <StatusDot kind={kind} size={9} />
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, letterSpacing: 0.8, color: t.textMuted }}>
          {label}
        </Text>
        <View style={{ width: 1, height: 12, backgroundColor: t.border }} />
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, letterSpacing: 0.8, color: t.textMuted }}>
          {s.monitored ? 'MONITORED' : 'UNMONITORED'}
        </Text>
      </View>
    );
  })() : null;

  // Hydration indicator pill — visible while isHydrating is true.
  // Driven by series.hydrating (real backend signal) with an isFetching fallback
  // for backward compat with old servers. The useSeries hook polls every 4 s
  // while hydrating, so the pill clears automatically when enrichment finishes.
  const hydrationPill = isHydrating ? (
    <View
      testID="series-hydration-pill"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surfaceMuted,
        alignSelf: 'flex-start',
        marginTop: 10,
      }}
    >
      <ActivityIndicator size="small" color={t.textMuted} style={{ width: 12, height: 12 }} />
      <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, letterSpacing: 1.0, color: t.textMuted }}>
        FETCHING DETAILS…
      </Text>
    </View>
  ) : null;

  // Synopsis block — always rendered for both single items and multi-volume series.
  // Shows a tasteful empty state when description is absent.
  const synopsisBlock = (
    <View style={{ marginTop: 16 }}>
      {s.description ? (
        <Text style={[text.bodySm, { color: t.textMuted, lineHeight: 20 }]}>
          {s.description}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FileText size={14} color={t.textMuted} strokeWidth={1.5} />
          <Text style={[text.monoSm, { color: t.textMuted, letterSpacing: 0.6 }]}>
            NO SYNOPSIS AVAILABLE
          </Text>
        </View>
      )}
    </View>
  );

  if (layout.isLandscape) {
    // Shared left-pane scroll content for both single-item and multi-volume tablet views.
    const tabletDetailPane = (
      <ScrollView contentContainerStyle={{ padding: 24 }} refreshControl={refreshControl}>
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          <IconButton
            testID="btn-back-series"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
          >
            <ChevronLeft size={22} color={t.text} strokeWidth={2} />
          </IconButton>
        </View>
        {/* Constrain the poster so it doesn't balloon to fill a wide pane.
            Left-aligned, capped at the shared DETAIL_HERO_MAX_WIDTH — correct for
            both the full-width single-item pane and the SplitView left pane. */}
        <View
          testID="series-hero"
          style={{ maxWidth: DETAIL_HERO_MAX_WIDTH, alignSelf: 'flex-start', width: '100%' }}
        >
          <Cover uri={s.coverUrl} hue={hueFromString(s.title)} ratio={3 / 4} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
          <Pill kind={s.contentType}>{TYPE_LABEL[s.contentType]}</Pill>
          {!isSingleItem && (
            <>
              <StatusDot kind={seriesStatus(s)} />
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, letterSpacing: 0.4, color: t.textMuted }}>
                {s.monitored ? 'MONITORED' : 'UNMONITORED'}
              </Text>
            </>
          )}
        </View>
        <Text style={{ fontFamily: fonts.display.semibold, fontSize: 28, letterSpacing: -0.7, lineHeight: 30, color: t.text, marginTop: 10 }}>
          {s.title}
        </Text>
        {hydrationPill}
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, letterSpacing: 0.5, lineHeight: 16, color: t.textMuted, marginTop: 8 }}>
          {[
            s.author?.toUpperCase(),
            s.startYear ?? null,
            isSingleItem ? null : `${s.volumes} VOLUMES`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {/* Single-item status badge (owned/missing + monitored). */}
        {singleItemStatusBadge}
        <Pressable
          testID="btn-primary-action"
          accessibilityRole="button"
          onPress={primary.onPress}
          style={{
            height: 40,
            borderRadius: 10,
            backgroundColor: t.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 18,
          }}
        >
          <primary.icon size={15} color={t.primaryFg} strokeWidth={2} />
          <Text style={{ fontFamily: fonts.sans.semibold, fontSize: 13.5, color: t.primaryFg }}>
            {primary.label}
          </Text>
        </Pressable>
        {/* Stats strip: hide VOLUMES stat for single items to avoid confusing "1 VOLUME" label. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginTop: 22,
            paddingTop: 18,
            borderTopWidth: 1,
            borderTopColor: t.border,
          }}
        >
          {(isSingleItem
            ? [
                { k: 'OWNED', v: s.downloaded > 0 ? 'YES' : 'NO' },
                { k: 'YEAR', v: s.startYear ? String(s.startYear) : '—' },
              ]
            : [
                { k: 'VOLUMES', v: String(s.volumes) },
                { k: 'OWNED', v: String(s.downloaded) },
                { k: 'MISSING', v: String(Math.max(0, s.volumes - s.downloaded)) },
                { k: 'YEAR', v: s.startYear ? String(s.startYear) : '—' },
              ]
          ).map((stat) => (
            <View key={stat.k} style={{ width: '50%', marginBottom: 14 }}>
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9, letterSpacing: 1.2, color: t.textMuted }}>
                {stat.k}
              </Text>
              <Text style={{ fontFamily: fonts.display.semibold, fontSize: 18, letterSpacing: -0.4, color: t.text, marginTop: 3 }}>
                {stat.v}
              </Text>
            </View>
          ))}
        </View>
        {groupRow}
        {/* part-of-series-row is always rendered here — it must not be hidden with the volumes panel. */}
        {partOfSeriesRow}
        {synopsisBlock}
      </ScrollView>
    );

    // Single-item titles: stretch the detail pane full-width (no right Volumes panel).
    if (!showVolumesPanel) {
      return (
        <ScreenContainer testID="screen-series-overview">
          <View testID="series-split" style={{ flex: 1, flexDirection: 'row' }}>
            <View testID="series-split-left" style={{ flex: 1, minWidth: 0 }}>
              {tabletDetailPane}
            </View>
          </View>
          {moveSheet}
        </ScreenContainer>
      );
    }

    return (
      <ScreenContainer testID="screen-series-overview">
        <SplitView
          testID="series-split"
          left={tabletDetailPane}
          right={
            <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={refreshControl}>
              <Text style={[text.monoSm, { color: t.textMuted, marginBottom: 10 }]}>
                VOLUMES · {s.volumes}
              </Text>
              {s.volumesList.slice(0, 24).map((v) => {
                const readerParams = volumeReaderParams(s.contentType, v);
                const rowStyle = {
                  flexDirection: 'row' as const,
                  alignItems: 'center' as const,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: t.border,
                  gap: 12,
                };
                const rowChildren = (
                  <>
                    <Text style={[text.mono, { color: t.textMuted, width: 32 }]}>
                      {String(v.number)}
                    </Text>
                    <Text numberOfLines={1} style={[text.label, { color: t.text, flex: 1 }]}>
                      {v.title ?? '—'}
                    </Text>
                    <VolumeReadMark read={v.read} contentType={s.contentType} />
                    <StatusDot kind={volumeStatus(v.status)} pulse={v.status === 'downloading'} />
                  </>
                );
                return readerParams ? (
                  <Pressable
                    key={v.id}
                    testID={`vol-${v.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={volumeActionLabel(s.contentType, v.number)}
                    onPress={() => navigation.navigate('Reader', readerParams)}
                    style={({ pressed }) => [rowStyle, pressed && { backgroundColor: t.surfaceMuted }]}
                  >
                    {rowChildren}
                  </Pressable>
                ) : (
                  <View key={v.id} testID={`vol-${v.id}`} style={rowStyle}>
                    {rowChildren}
                  </View>
                );
              })}
            </ScrollView>
          }
        />
        {moveSheet}
      </ScreenContainer>
    );
  }

  const missing = Math.max(0, s.volumes - s.downloaded);
  const recent = s.volumesList.slice(0, 6);

  return (
    <View testID="screen-series-overview" style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={refreshControl}
      >
        {/* Hero.
            Tablet portrait (isTablet, not isLandscape): render a normal header
            row ABOVE a constrained left-aligned poster — mirrors
            BookSeriesDetail's tablet branch so a portrait tablet doesn't get
            a ~1024 px-tall full-bleed giant cover.
            Phone (true phone, width < 600): keep the full-bleed flush hero +
            overlaid SafeAreaView back chrome + gradient fade, byte-for-byte. */}
        {layout.isTablet ? (
          <>
            <SafeAreaView edges={['top']}>
              <View
                style={{
                  flexDirection: 'row',
                  paddingHorizontal: 14,
                  paddingTop: 6,
                }}
              >
                <IconButton accessibilityLabel="Back" onPress={() => navigation.goBack()}>
                  <ChevronLeft size={20} color={t.text} strokeWidth={2} />
                </IconButton>
              </View>
            </SafeAreaView>
            <View
              testID="series-hero"
              style={{ maxWidth: DETAIL_HERO_MAX_WIDTH, alignSelf: 'flex-start', width: '100%', paddingHorizontal: 18, paddingTop: 8 }}
            >
              <Cover uri={s.coverUrl} hue={hueFromString(s.title)} ratio={3 / 4} />
            </View>
          </>
        ) : (
          <Cover uri={s.coverUrl} hue={hueFromString(s.title)} ratio={3 / 4} flush>
            <Svg style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} width="100%" height="60%">
              <Defs>
                <LinearGradient id="herofade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={t.bg} stopOpacity={0} />
                  <Stop offset="1" stopColor={t.bg} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#herofade)" />
            </Svg>
            <SafeAreaView
              edges={['top']}
              style={{ position: 'absolute', top: 0, left: 14, right: 14 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingTop: 6,
                }}
              >
                <IconButton onDark accessibilityLabel="Back" onPress={() => navigation.goBack()}>
                  <ChevronLeft size={18} color={t.coverTitle} strokeWidth={2} />
                </IconButton>
              </View>
            </SafeAreaView>
          </Cover>
        )}

        {/* Title block, overlapping the hero fade on phone; sitting naturally
            below the constrained poster on tablet portrait. */}
        <View style={{ marginTop: layout.isTablet ? 18 : -96, paddingHorizontal: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Pill kind={s.contentType}>{TYPE_LABEL[s.contentType]}</Pill>
            {!isSingleItem && (
              <>
                <StatusDot kind={seriesStatus(s)} />
                <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, letterSpacing: 0.5, color: t.textMuted }}>
                  {s.monitored ? 'MONITORED' : 'UNMONITORED'}
                </Text>
              </>
            )}
          </View>
          <Text style={{ fontFamily: fonts.display.semibold, fontSize: 34, letterSpacing: -1, lineHeight: 36, color: t.text }}>
            {s.title}
          </Text>
          {hydrationPill}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {s.author ? (
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, letterSpacing: 0.4, color: t.textMuted }}>
                {s.author.toUpperCase()}
              </Text>
            ) : null}
            {s.author && s.startYear ? (
              <View style={{ width: 3, height: 3, borderRadius: 999, backgroundColor: t.border }} />
            ) : null}
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, letterSpacing: 0.4, color: t.textMuted }}>
              {s.startYear ?? '—'}
            </Text>
            {!isSingleItem ? (
              <>
                <View style={{ width: 3, height: 3, borderRadius: 999, backgroundColor: t.border }} />
                <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, letterSpacing: 0.4, color: t.textMuted }}>
                  {s.volumes} VOLUMES
                </Text>
              </>
            ) : null}
          </View>
          {/* Single-item status badge shows owned/missing state inline on the book. */}
          {singleItemStatusBadge}
        </View>

        {/* Primary action */}
        <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
          <Pressable
            testID="btn-primary-action"
            accessibilityRole="button"
            onPress={primary.onPress}
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: t.primary,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <primary.icon size={16} color={t.primaryFg} strokeWidth={2} />
            <Text style={{ fontFamily: fonts.sans.semibold, fontSize: 14.5, color: t.primaryFg }}>
              {primary.label}
            </Text>
          </Pressable>
        </View>

        {/* Stats strip — for single items show OWNED + YEAR only (no VOLUMES/MISSING). */}
        <View
          style={{
            marginHorizontal: 18,
            marginTop: 18,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: t.border,
            flexDirection: 'row',
          }}
        >
          {(isSingleItem
            ? [
                { k: 'OWNED', v: s.downloaded > 0 ? 'YES' : 'NO' },
                { k: 'YEAR', v: s.startYear ? String(s.startYear) : '—' },
              ]
            : [
                { k: 'VOLUMES', v: String(s.volumes) },
                { k: 'OWNED', v: String(s.downloaded) },
                { k: 'MISSING', v: String(missing) },
                { k: 'YEAR', v: s.startYear ? String(s.startYear) : '—' },
              ]
          ).map((stat) => (
            <View key={stat.k} style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9, letterSpacing: 1.2, color: t.textMuted }}>
                {stat.k}
              </Text>
              <Text style={{ fontFamily: fonts.display.semibold, fontSize: 19, letterSpacing: -0.4, marginTop: 3, color: t.text }}>
                {stat.v}
              </Text>
            </View>
          ))}
        </View>

        {/* Group row — stacks under the stats strip as a continuing bordered row. */}
        {/* part-of-series-row is always rendered here regardless of isSingleItem. */}
        <View style={{ marginHorizontal: 18 }}>
          {groupRow}
          {partOfSeriesRow}
        </View>

        {/* Tabs — Volumes tab is hidden for single-item titles. */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 18, paddingTop: 18, borderBottomWidth: 1, borderBottomColor: t.border }}>
          {(
            [
              { key: 'overview', label: 'Overview', active: true },
              // Volumes tab only for multi-volume series.
              ...(showVolumesPanel
                ? ([{ key: 'volumes', label: `Volumes · ${s.volumes}`, testID: 'btn-volumes' }] as const)
                : []),
              // Releases only matters while volumes are still missing — once the
              // series is fully downloaded there's nothing left to search for.
              ...(showReleasesTab
                ? ([{ key: 'releases', label: 'Releases', testID: 'btn-interactive-search' }] as const)
                : []),
            ] as const
          ).map((tab) => (
            <Pressable
              key={tab.key}
              testID={'testID' in tab ? tab.testID : undefined}
              accessibilityRole="button"
              onPress={() => {
                if (tab.key === 'volumes')
                  navigation.navigate('SeriesVolumes', { seriesId: String(id) });
                else if (tab.key === 'releases')
                  gate(() => navigation.navigate('InteractiveSearch', { seriesId: String(id) }))();
              }}
              style={{
                marginRight: 20,
                paddingBottom: 12,
                marginBottom: -1,
                borderBottomWidth: 'active' in tab && tab.active ? 2 : 0,
                borderBottomColor: t.primary,
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.sans.medium,
                  fontSize: 13.5,
                  color: 'active' in tab && tab.active ? t.text : t.textMuted,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Synopsis — always rendered. Shows a tasteful empty state when absent. */}
        <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
          {synopsisBlock}
        </View>

        {/* Recent volumes rail — hidden for single-item titles. */}
        {!isSingleItem && recent.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 18 }}>
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, letterSpacing: 1.2, color: t.textMuted }}>
                RECENT VOLUMES
              </Text>
              <Pressable
                testID="btn-volumes-seeall"
                onPress={() => navigation.navigate('SeriesVolumes', { seriesId: String(id) })}
              >
                <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12, color: t.primary }}>
                  See all
                </Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingHorizontal: 18, paddingTop: 12 }}
            >
              {recent.map((v) => {
                const readerParams = volumeReaderParams(s.contentType, v);
                const card = (
                  <>
                    <Cover
                      uri={resolveAssetUri(serverUrl, v.coverUrl)}
                      hue={hueFromString(`${s.title}${v.number}`)}
                      title={`Vol. ${v.number}`}
                    >
                      <View
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          zIndex: 2,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {v.read === 'finished' ? (
                          <ReadCheckBadge contentType={s.contentType} />
                        ) : null}
                        <StatusBadge kind={volumeStatus(v.status)} size={18} />
                      </View>
                    </Cover>
                    <Text
                      style={{
                        fontFamily: fonts.mono.regular,
                        fontSize: 10,
                        letterSpacing: 0.4,
                        color: t.textMuted,
                        textAlign: 'center',
                        marginTop: 6,
                      }}
                    >
                      {`VOL · ${String(v.number).padStart(2, '0')}`}
                    </Text>
                  </>
                );
                return readerParams ? (
                  <Pressable
                    key={v.id}
                    testID={`vol-card-${v.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={volumeActionLabel(s.contentType, v.number)}
                    onPress={() => navigation.navigate('Reader', readerParams)}
                    style={{ width: 80 }}
                  >
                    {card}
                  </Pressable>
                ) : (
                  <View key={v.id} style={{ width: 80 }}>
                    {card}
                  </View>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </ScrollView>
      {moveSheet}
    </View>
  );
}
