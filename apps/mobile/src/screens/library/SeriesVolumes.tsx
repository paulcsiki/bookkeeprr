import { useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, CloudOff } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppBar } from '@/components/AppBar';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Cover } from '@/components/Cover';
import { Pill } from '@/components/Pill';
import { Chip } from '@/components/Chip';
import { StatusDot } from '@/components/StatusDot';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { hueFromString } from '@/theme/color';
import { seriesStatus, volumeStatus, isVolumeMissing, TYPE_LABEL } from '@/features/library/seriesMeta';
import { VolumeReadMark } from '@/features/library/VolumeReadMark';
import { volumeReaderParams, volumeActionLabel } from '@/features/library/volumeReader';
import { useSeries } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import { offlineReaderParams, useOfflineLibrarySeries } from '@/features/system/offlineContent';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { OfflineSection } from '@/features/system/OfflineSection';
import { useLayout } from '@/responsive/useLayout';
import { SplitView } from '@/responsive/SplitView';
import type { Volume } from '@/api/schemas';
import type { LibraryStackParamList } from '@/navigation/types';

function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10).replace(/-/g, '.') : '—';
}

export default function SeriesVolumes() {
  const route = useRoute<RouteProp<LibraryStackParamList, 'SeriesVolumes'>>();
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const seriesId = route.params.seriesId;
  const id = Number(seriesId);
  const t = useTokens();
  const q = useSeries(id);
  const layout = useLayout();
  const online = useIsOnline();
  const { gate } = useOnlineGate();
  const offlineRow = useOfflineLibrarySeries().find((r) => r.seriesId === id) ?? null;
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const [filter, setFilter] = useState<'all' | 'missing'>('all');

  if (online && q.isLoading)
    return (
      <ScreenContainer testID="screen-volumes-loading">
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
          <ScreenContainer testID="screen-series-volumes">
            <SplitView
              testID="volumes-split"
              left={
                <ScrollView contentContainerStyle={{ padding: 24 }}>
                  <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                    <IconButton testID="btn-back-volumes" accessibilityLabel="Back" onPress={() => navigation.goBack()}>
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
        <ScreenContainer testID="screen-series-volumes">
          <View style={{ flexDirection: 'row', paddingTop: 4 }}>
            <IconButton accessibilityLabel="Back" onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={t.text} strokeWidth={2} />
            </IconButton>
          </View>
          <ScrollView>{list}</ScrollView>
        </ScreenContainer>
      );
    }
    return (
      <ScreenContainer testID="screen-volumes-error">
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
  const missingCount = s.volumesList.filter((v) => isVolumeMissing(v.status)).length;
  const visible =
    filter === 'missing' ? s.volumesList.filter((v) => isVolumeMissing(v.status)) : s.volumesList;

  const refreshControl = (
    <RefreshControl
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      tintColor={t.textMuted}
    />
  );

  // Counts + All/Missing chips — shared between the phone and tablet layouts.
  const filterRow = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, letterSpacing: 1, color: t.textMuted }}>
        {s.volumes} VOLUMES · {missingCount} MISSING
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Chip active={filter === 'all'} onPress={() => setFilter('all')}>
          All
        </Chip>
        <Chip active={filter === 'missing'} onPress={() => setFilter('missing')}>
          Missing
        </Chip>
      </View>
    </View>
  );

  // One volume row — identical markup in the phone list and the tablet right
  // pane. Owned volumes open in the reader (audiobooks → the audio player);
  // missing ones have nothing to read, so their row stays inert.
  const renderVolumeRow = (v: Volume) => {
    const readerParams = volumeReaderParams(s.contentType, v);
    const rowStyle = {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 14,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    };
    const rowChildren = (
      <>
        <View style={{ width: 32 }}>
          <Cover
            uri={resolveAssetUri(serverUrl, v.coverUrl)}
            hue={hueFromString(`${s.title}${v.number}`)}
            size="sm"
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.sans.medium, fontSize: 13.5, color: t.text }}>
            Volume {String(v.number)}
          </Text>
          <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, letterSpacing: 0.4, color: t.textMuted, marginTop: 2 }}>
            {v.status.toUpperCase()} · {fmtDate(v.publishedAt)}
          </Text>
        </View>
        <VolumeReadMark read={v.read} contentType={s.contentType} />
        <StatusDot kind={volumeStatus(v.status)} pulse={v.status === 'downloading'} />
        {/* Chevron only on readable rows — it signals "tap to open". */}
        {readerParams ? (
          <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
        ) : null}
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
  };

  if (layout.isLandscape) {
    return (
      <ScreenContainer testID="screen-series-volumes">
        <SplitView
          testID="volumes-split"
          left={
            <ScrollView contentContainerStyle={{ padding: 24 }} refreshControl={refreshControl}>
              <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                <IconButton
                  testID="btn-back-volumes"
                  accessibilityLabel="Back"
                  onPress={() => navigation.goBack()}
                >
                  <ChevronLeft size={22} color={t.text} strokeWidth={2} />
                </IconButton>
              </View>
              <Cover uri={s.coverUrl} hue={hueFromString(s.title)} ratio={3 / 4} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
                <Pill kind={s.contentType}>{TYPE_LABEL[s.contentType]}</Pill>
                <StatusDot kind={seriesStatus(s)} />
              </View>
              <Text style={{ fontFamily: fonts.display.semibold, fontSize: 28, letterSpacing: -0.7, lineHeight: 30, color: t.text, marginTop: 10 }}>
                {s.title}
              </Text>
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, letterSpacing: 0.5, color: t.textMuted, marginTop: 8 }}>
                {s.downloaded} / {s.volumes} VOLS
              </Text>
            </ScrollView>
          }
          right={
            <View style={{ flex: 1 }}>
              {filterRow}
              <ScrollView
                contentContainerStyle={{ paddingBottom: 24 }}
                refreshControl={refreshControl}
              >
                {visible.map(renderVolumeRow)}
              </ScrollView>
            </View>
          }
        />
      </ScreenContainer>
    );
  }

  return (
    <View testID="screen-series-volumes" style={{ flex: 1, backgroundColor: t.bg }}>
      <AppBar
        title={s.title}
        leading={
          <IconButton accessibilityLabel="Back" onPress={() => navigation.goBack()}>
            <ChevronLeft size={18} color={t.textMuted} strokeWidth={2} />
          </IconButton>
        }
      />

      {/* Sub-header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 18,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        }}
      >
        <View style={{ width: 48 }}>
          <Cover uri={s.coverUrl} hue={hueFromString(s.title)} size="sm" />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pill kind={s.contentType} size="xs">
              {TYPE_LABEL[s.contentType]}
            </Pill>
            <StatusDot kind={seriesStatus(s)} />
          </View>
          <Text numberOfLines={1} style={{ fontFamily: fonts.display.semibold, fontSize: 17, letterSpacing: -0.3, color: t.text }}>
            {s.title}
          </Text>
          <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, letterSpacing: 0.5, color: t.textMuted }}>
            {s.downloaded} / {s.volumes} VOLS
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: t.border }}>
        {(
          [
            { key: 'overview', label: 'Overview' },
            { key: 'volumes', label: `Volumes · ${s.volumes}`, active: true },
            // Hide Releases once every volume is downloaded (nothing to search).
            ...(s.volumes > 0 && s.downloaded >= s.volumes
              ? []
              : ([{ key: 'releases', label: 'Releases' }] as const)),
          ] as const
        ).map((tab) => (
          <Text
            key={tab.key}
            onPress={() => {
              if (tab.key === 'overview') navigation.navigate('SeriesOverview', { seriesId: String(id) });
              else if (tab.key === 'releases')
                gate(() => navigation.navigate('InteractiveSearch', { seriesId: String(id) }))();
            }}
            style={{
              fontFamily: fonts.sans.medium,
              fontSize: 13.5,
              color: 'active' in tab && tab.active ? t.text : t.textMuted,
              paddingTop: 12,
              paddingBottom: 12,
              marginRight: 20,
              marginBottom: -1,
              borderBottomWidth: 'active' in tab && tab.active ? 2 : 0,
              borderBottomColor: t.primary,
            }}
          >
            {tab.label}
          </Text>
        ))}
      </View>

      {/* Filter row */}
      {filterRow}

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} refreshControl={refreshControl}>
        {visible.map(renderVolumeRow)}
      </ScrollView>
    </View>
  );
}
