import { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, ChevronRight, ChevronDown, Trash2, DownloadCloud, AlertTriangle, Clock, Pause } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { SettingsSection } from '@/components/SettingsSection';
import { Cover } from '@/components/Cover';
import { Pill } from '@/components/Pill';
import { StorageMeter } from '@/features/reader/StorageMeter';
import { DownloadVolumeRow } from '@/features/reader/DownloadRow';
import { useOfflineDownloads, KEY as OFFLINE_KEY, type OfflineItem } from '@/features/reader/lib/useOfflineDownloads';
import { useOfflineSettings } from '@/features/reader/lib/offline-settings';
import { timeLeft } from '@/features/reader/lib/timeLeft';
import { safeKey } from '@/features/reader/lib/offline-download';
import { useSeries } from '@/api/hooks/useSeries';
import { useReaderDownloads, downloadReadable, type DownloadEntry } from '@/state/readerDownloadsStore';
import { useOnlineGate } from '@/features/system/online';
import { useAuth } from '@/auth/AuthContext';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import type { ContentType } from '@/api/schemas';
import type { SettingsStackParamList } from '@/navigation/types';

type Sort = 'recent' | 'largest' | 'title';

const TRANSPARENT = 'transparent';

const TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga', comic: 'Comic', novel: 'Novel', ebook: 'eBook', audio: 'Audio',
};

/**
 * Content-type-aware noun for the "Download remaining …" button.
 * manga/comic default to "volumes"; novel/ebook → "books"; audio → "audiobooks".
 */
export function remainingNoun(contentType: ContentType): string {
  switch (contentType) {
    case 'manga':
    case 'comic':
      return 'volumes';
    case 'novel':
    case 'ebook':
      return 'books';
    case 'audio':
      return 'audiobooks';
  }
}

/**
 * A single in-flight (queued/downloading/error) download entry lifted out of
 * the zustand store, enriched with its readableKey for stable React keys.
 */
export interface ActiveDownload {
  readableKey: string;
  entry: DownloadEntry;
}

/**
 * Group active (non-done) downloads from the store by seriesName so they can
 * be displayed alongside completed series groups. Returns only queued,
 * downloading, and error entries — done entries are handled by the disk scan.
 */
export function groupActiveDownloads(
  downloads: Record<string, DownloadEntry>,
): Map<string, ActiveDownload[]> {
  const groups = new Map<string, ActiveDownload[]>();
  for (const [key, entry] of Object.entries(downloads)) {
    if (entry.state === 'done') continue;
    const groupKey = entry.seriesName ?? entry.title ?? key;
    const arr = groups.get(groupKey) ?? [];
    arr.push({ readableKey: key, entry });
    groups.set(groupKey, arr);
  }
  return groups;
}

function fmtSize(bytes: number): string {
  if (bytes <= 0) return '—';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
}

export default function Downloads({ now = Date.now }: { now?: () => number } = {}) {
  const t = useTokens();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const dl = useOfflineDownloads();
  const { settings, setAutoDownloadNext, setWifiOnly } = useOfflineSettings();
  const qc = useQueryClient();

  const [sort, setSort] = useState<Sort>('largest');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Live subscription to in-flight downloads (queued/downloading/error).
  // Selector returns only non-done entries so re-renders are minimal — zustand
  // calls this on every store change and only schedules a re-render when the
  // returned value changes structurally (object identity). We re-extract
  // non-done entries here so the selector is a pure referential check.
  const storeDownloads = useReaderDownloads((s) => s.downloads);

  // Group active downloads by series for display. Memoized so grouping only
  // runs when the store snapshot changes.
  const activeGroups = useMemo(
    () => groupActiveDownloads(storeDownloads),
    [storeDownloads],
  );

  // Track the set of keys that were already 'done' on the previous render so
  // we only invalidate when a NEW key transitions to done (not on every
  // progress update that happens while an older entry is already done).
  const prevDoneRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nowDone = new Set(
      Object.entries(storeDownloads)
        .filter(([, e]) => e.state === 'done')
        .map(([k]) => k),
    );
    const hasNewDone = [...nowDone].some((k) => !prevDoneRef.current.has(k));
    prevDoneRef.current = nowDone;
    if (hasNewDone) {
      void qc.invalidateQueries({ queryKey: OFFLINE_KEY });
    }
  }, [storeDownloads, qc]);

  const sorted = useMemo(() => {
    const arr = dl.items.slice();
    if (sort === 'largest') arr.sort((a, b) => b.bytes - a.bytes);
    else if (sort === 'title') arr.sort((a, b) => a.title.localeCompare(b.title));
    else arr.sort((a, b) => b.lastReadAt - a.lastReadAt);
    return arr;
  }, [dl.items, sort]);

  const selectedKeys = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const selectedBytes = sorted.filter((it) => selected[it.readableKey]).reduce((s, it) => s + it.bytes, 0);
  // Three distinct states so the populated chrome never flashes before the
  // empty/onboarding view: while the disk scan runs we show a spinner, then
  // either the empty state or the list + chrome.
  const loading = dl.isLoading;
  const hasActive = activeGroups.size > 0;
  // Empty only when disk has no items AND no active in-flight downloads.
  const empty = !loading && dl.items.length === 0 && !hasActive;
  const ready = !loading && (dl.items.length > 0 || hasActive);

  const exitSelectMode = (): void => {
    setSelectMode(false);
    setSelected({});
  };

  const SortBtn = ({ id, label }: { id: Sort; label: string }) => {
    const active = sort === id;
    return (
      <Pressable
        onPress={() => setSort(id)}
        style={{
          height: 30,
          paddingHorizontal: 12,
          borderRadius: 99,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: active ? t.primary : t.border,
          backgroundColor: active ? withAlpha(t.primary, 0.12) : TRANSPARENT,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 10.5,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: active ? t.primary : t.textMuted,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScreenContainer testID="screen-downloads">
      <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: t.textMuted, marginBottom: 6 }}>
              Offline · this device
            </Text>
            <Text style={{ fontFamily: fonts.display.semibold, fontSize: 27, letterSpacing: -0.6, color: t.text }}>
              Downloads
            </Text>
          </View>
          {ready ? (
            <Pressable
              testID="btn-select"
              onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              style={{
                paddingHorizontal: 14,
                height: 34,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: selectMode ? t.primary : t.border,
                backgroundColor: selectMode ? withAlpha(t.primary, 0.12) : t.surfaceMuted,
              }}
            >
              <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12.5, color: t.text }}>
                {selectMode ? 'Done' : 'Select'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {ready ? <StorageMeter totalBytes={dl.totalBytes} byType={dl.byType} /> : null}
      </View>

      {ready ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', color: t.textMuted, flex: 1 }}>
            {dl.items.length} titles
          </Text>
          {!selectMode ? (
            <>
              <SortBtn id="recent" label="Recent" />
              <SortBtn id="largest" label="Largest" />
              <SortBtn id="title" label="A–Z" />
            </>
          ) : null}
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {loading ? (
          <View testID="downloads-loading" style={{ alignItems: 'center', paddingVertical: 60 }}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : empty ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 14 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.surfaceMuted,
                borderWidth: 1,
                borderColor: t.border,
              }}
            >
              <CloudOff size={30} color={t.textMuted} />
            </View>
            <Text style={[text.displayMd, { color: t.text, textAlign: 'center' }]}>
              No downloads on this device
            </Text>
            <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center', maxWidth: 320, lineHeight: 19 }]}>
              Tap the download icon on any title to keep it here for offline reading. Everything you remove stays in your library in the cloud.
            </Text>
            <Button
              testID="btn-browse-library"
              label="Browse library"
              onPress={() => navigation.getParent()?.navigate('Library' as never)}
            />
          </View>
        ) : (
          <>
            {/* Active (queued/downloading/error) entries — grouped by series,
                shown at the top so in-progress work is immediately visible. */}
            {hasActive && !selectMode ? (
              <ActiveDownloadsSection groups={activeGroups} />
            ) : null}

            {sorted.map((it) => (
              <DownloadSeriesGroup
                key={it.readableKey}
                item={it}
                now={now}
                selectMode={selectMode}
                selected={!!selected[it.readableKey]}
                onToggleSelect={() => setSelected((s) => ({ ...s, [it.readableKey]: !s[it.readableKey] }))}
                onRemoveAll={() => { void dl.removeMany(it.readableKeys); }}
                onRemoveVolume={(key) => { void dl.removeMany([key]); }}
              />
            ))}
          </>
        )}

        {/* Retention notice. */}
        {ready ? (
          <Text
            style={{
              fontFamily: fonts.mono.regular,
              fontSize: 9.5,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: t.textMuted,
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            Offline content is kept for 30 days
          </Text>
        ) : null}
      </ScrollView>

      {ready && !selectMode ? (
        <View style={{ paddingHorizontal: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface }}>
          <SettingsSection label="OFFLINE & DOWNLOADS" description="How chapters download for offline reading.">
            <View style={{ padding: 14, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sans.medium, fontSize: 13, color: t.text }}>
                    Auto-download next in series
                  </Text>
                  <Text style={[text.bodySm, { color: t.textMuted, marginTop: 2 }]}>
                    Fetches the next chapter while reading.
                  </Text>
                </View>
                <Toggle on={settings.autoDownloadNext} onChange={setAutoDownloadNext} testID="toggle-auto-next" />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sans.medium, fontSize: 13, color: t.text }}>
                    Download on Wi-Fi only
                  </Text>
                  <Text style={[text.bodySm, { color: t.textMuted, marginTop: 2 }]}>
                    Pauses downloads on cellular.
                  </Text>
                </View>
                <Toggle on={settings.wifiOnly} onChange={setWifiOnly} testID="toggle-wifi-only" />
              </View>
            </View>
          </SettingsSection>
        </View>
      ) : null}

      {selectMode ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.sans.medium, fontSize: 14, color: t.text }}>
              {selectedKeys.length ? `${selectedKeys.length} selected` : 'Select titles to remove'}
            </Text>
            {selectedKeys.length > 0 ? (
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, color: t.ok, marginTop: 2, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Frees {fmtSize(selectedBytes)}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              const all: Record<string, boolean> = {};
              sorted.forEach((it) => { all[it.readableKey] = true; });
              setSelected(all);
            }}
            style={{
              height: 40,
              paddingHorizontal: 14,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: t.border,
              backgroundColor: t.surfaceMuted,
            }}
          >
            <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12.5, color: t.text }}>All</Text>
          </Pressable>
          <Pressable
            testID="btn-bulk-remove"
            disabled={selectedKeys.length === 0}
            onPress={async () => {
              // Expand selected series-groups to every offline volume they hold.
              const keys = sorted
                .filter((it) => selected[it.readableKey])
                .flatMap((it) => it.readableKeys);
              await dl.removeMany(keys);
              exitSelectMode();
            }}
            style={{
              height: 40,
              paddingHorizontal: 18,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(t.err, 0.16),
              opacity: selectedKeys.length === 0 ? 0.45 : 1,
            }}
          >
            <Text style={{ fontFamily: fonts.sans.medium, fontSize: 13, color: t.err }}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

type GroupProps = {
  item: OfflineItem;
  now: () => number;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRemoveAll: () => void;
  onRemoveVolume: (readableKey: string) => void;
};

/**
 * One series group in the Downloads manager: a tappable series row (cover, name,
 * volume count, total size, soonest time-left) that expands to its per-volume
 * list with single actions. Per-series "Remove all" + "Download rest of series",
 * the latter online-gated. Each group owns its own `useSeries` query (hook rules
 * forbid calling it inside the parent's `.map`), enabled only when the series id
 * is known + the session is authenticated — so it never fires offline.
 */
function DownloadSeriesGroup({
  item, now, selectMode, selected, onToggleSelect, onRemoveAll, onRemoveVolume,
}: GroupProps) {
  const t = useTokens();
  const [open, setOpen] = useState(false);
  const { online, gate } = useOnlineGate();
  const { state } = useAuth();
  const series = useSeries(item.seriesId ?? undefined);

  const groupId = String(item.seriesId ?? item.readableKey);
  // Series row shows the soonest expiry (item.downloadedAt is already the min).
  const seriesTimeLeft = timeLeft(item.downloadedAt, now());

  // Enqueue every series volume not already offline. Online-gated: offline this
  // toasts "Unavailable offline" and never runs (series.data is also paused).
  const downloadRest = gate(() => {
    if (state.status !== 'authenticated') return;
    const creds = state.creds;
    const vols = series.data?.volumesList ?? [];
    const offlineKeys = new Set(item.readableKeys); // safe-key dirnames
    for (const v of vols) {
      if (v.libraryFileId == null) continue;
      const key = `page:file:${v.libraryFileId}`;
      if (offlineKeys.has(safeKey(key))) continue; // already on disk
      void downloadReadable(key, {
        serverUrl: creds.serverUrl,
        token: creds.token,
        ...(v.title ? { title: v.title } : {}),
        seriesName: item.seriesName,
        contentType: item.contentType,
        coverUrl: v.coverUrl ?? null,
        volumeLabel: `Vol. ${v.number}`,
      });
    }
  });

  // In select mode the group collapses to a flat selectable row (preserves the
  // existing bulk-remove flow): the whole row toggles selection, no expand/actions.
  if (selectMode) {
    return (
      <Pressable
        testID={`download-series-${groupId}`}
        onPress={onToggleSelect}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 4,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        }}
      >
        <View
          style={{
            width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
            borderColor: selected ? t.primary : t.border,
            backgroundColor: selected ? t.primary : TRANSPARENT,
          }}
        />
        <View style={{ width: 42, height: 60 }}>
          <Cover hue={item.hue} uri={item.coverUrl} title={item.seriesName} size="sm" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sans.medium, fontSize: 14, color: t.text }}>
            {item.seriesName}
          </Text>
          <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, color: t.textMuted, marginTop: 3 }}>
            {item.volumeCount > 1 ? `${item.volumeCount} volumes` : fmtSize(item.bytes)}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11.5, color: t.text }}>
          {fmtSize(item.bytes)}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: t.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 }}>
        <Pressable
          testID={`download-series-${groupId}`}
          accessibilityRole="button"
          onPress={() => setOpen((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
        >
          <View testID={`download-series-expand-${groupId}`} style={{ width: 18, alignItems: 'center' }}>
            {open ? <ChevronDown size={18} color={t.textMuted} /> : <ChevronRight size={18} color={t.textMuted} />}
          </View>
          <View style={{ width: 42, height: 60 }}>
            <Cover hue={item.hue} uri={item.coverUrl} title={item.seriesName} size="sm" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Pill kind={item.contentType}>{TYPE_LABEL[item.contentType]}</Pill>
            </View>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sans.medium, fontSize: 14, color: t.text }}>
              {item.seriesName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, color: t.textMuted }}>
                {item.volumeCount > 1 ? `${item.volumeCount} volumes` : fmtSize(item.bytes)}
              </Text>
              <Text testID="download-time-left" style={{ fontFamily: fonts.mono.regular, fontSize: 10, color: t.textMuted }}>
                {seriesTimeLeft}
              </Text>
            </View>
          </View>
        </Pressable>
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11.5, color: t.text, fontWeight: '500' }}>
          {fmtSize(item.bytes)}
        </Text>
      </View>

      {/* Per-series actions. */}
      <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 30, paddingBottom: 12, paddingRight: 4 }}>
        <Pressable
          testID={`download-remove-series-${groupId}`}
          onPress={onRemoveAll}
          style={{
            height: 32, paddingHorizontal: 12, borderRadius: 9,
            flexDirection: 'row', alignItems: 'center', gap: 6,
            borderWidth: 1, borderColor: t.border, backgroundColor: withAlpha(t.err, 0.08),
          }}
        >
          <Trash2 size={13} color={t.err} />
          <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12, color: t.err }}>
            {item.volumeCount > 1 ? 'Remove all' : 'Remove'}
          </Text>
        </Pressable>
        {item.volumeCount >= 1 ? (
          // Online-gated: offline it dims (cue) and pressing toasts "Unavailable
          // offline" via the gate — it never enqueues. Remove stays usable offline.
          <Pressable
            testID={`download-series-download-${groupId}`}
            onPress={() => downloadRest()}
            style={{
              height: 32, paddingHorizontal: 12, borderRadius: 9,
              flexDirection: 'row', alignItems: 'center', gap: 6,
              borderWidth: 1, borderColor: t.border, backgroundColor: withAlpha(t.primary, 0.1),
              opacity: online ? 1 : 0.4,
            }}
          >
            <DownloadCloud size={13} color={t.primary} />
            <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12, color: t.primary }}>
              {`Download remaining ${remainingNoun(item.contentType)}`}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Expanded per-volume list. */}
      {open ? (
        <View style={{ paddingBottom: 8 }}>
          {item.volumes.map((v) => (
            <DownloadVolumeRow
              key={v.readableKey}
              readableKey={v.readableKey}
              title={v.title}
              bytes={v.bytes}
              broken={v.broken}
              timeLeftLabel={timeLeft(v.downloadedAt, now())}
              onRemove={() => onRemoveVolume(v.readableKey)}
              onRedownload={() => downloadRest()}
              redownloadDisabled={!online}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Active downloads section — queued, downloading, and error entries
// ---------------------------------------------------------------------------

type ActiveRowProps = {
  readableKey: string;
  entry: DownloadEntry;
};

/**
 * A single in-flight download row. Shows the volume title + optional series
 * name, a content-type pill, a progress bar when downloading, a "Queued" badge
 * when waiting, or an error state. Subscribes to the store live so progress
 * re-renders on every `setProgress` call without polling.
 */
function ActiveDownloadRow({ readableKey, entry }: ActiveRowProps) {
  const t = useTokens();
  const { state } = useAuth();
  const ct: ContentType = entry.contentType ?? 'manga';
  const label = entry.volumeLabel ?? entry.title ?? readableKey;
  const seriesName = entry.seriesName;

  return (
    <View
      testID={`download-inprogress-${readableKey}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      {/* Cover placeholder */}
      <View style={{ width: 42, height: 60 }}>
        <Cover hue={0} uri={entry.coverUrl ?? null} title={label} size="sm" />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Pill kind={ct}>{TYPE_LABEL[ct]}</Pill>
          {entry.state === 'queued' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                height: 16,
                paddingHorizontal: 6,
                borderRadius: 999,
                backgroundColor: t.surfaceMuted,
                borderWidth: 1,
                borderColor: t.border,
              }}
            >
              <Clock size={9} color={t.textMuted} />
              <Text style={{ fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 0.9, color: t.textMuted, textTransform: 'uppercase' }}>
                Queued
              </Text>
            </View>
          ) : null}
          {entry.state === 'error' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                height: 16,
                paddingHorizontal: 6,
                borderRadius: 999,
                backgroundColor: withAlpha(t.err, 0.12),
                borderWidth: 1,
                borderColor: withAlpha(t.err, 0.3),
              }}
            >
              <AlertTriangle size={9} color={t.err} />
              <Text style={{ fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 0.9, color: t.err, textTransform: 'uppercase' }}>
                Failed
              </Text>
            </View>
          ) : null}
          {entry.state === 'paused' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 16, paddingHorizontal: 6, borderRadius: 999, backgroundColor: t.surfaceMuted, borderWidth: 1, borderColor: t.border }}>
              <Pause size={9} color={t.textMuted} />
              <Text style={{ fontFamily: fonts.mono.medium, fontSize: 8.5, letterSpacing: 0.9, color: t.textMuted, textTransform: 'uppercase' }}>Paused</Text>
            </View>
          ) : null}
        </View>

        {seriesName ? (
          <Text numberOfLines={1} style={{ fontFamily: fonts.mono.regular, fontSize: 9.5, color: t.textMuted, marginBottom: 2 }}>
            {seriesName}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={{ fontFamily: fonts.sans.medium, fontSize: 14, color: t.text }}>
          {label}
        </Text>

        {entry.state === 'downloading' || entry.state === 'paused' ? (
          <View style={{ marginTop: 6, gap: 3 }}>
            {/* Progress track */}
            <View
              style={{
                height: 4,
                borderRadius: 99,
                overflow: 'hidden',
                backgroundColor: t.surfaceMuted,
                borderWidth: 1,
                borderColor: t.border,
              }}
            >
              <View
                style={{
                  height: 4,
                  width: `${entry.pct}%`,
                  borderRadius: 99,
                  backgroundColor: t.primary,
                }}
              />
            </View>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9.5, letterSpacing: 0.3, color: t.textMuted }}>
              {`${Math.round(entry.pct)}%`}
              {entry.bytes > 0 ? `  ·  ${fmtSize(entry.bytes)}` : ''}
            </Text>
          </View>
        ) : null}
        {(entry.state === 'paused' || entry.state === 'error') && state.status === 'authenticated' ? (
          <Pressable
            testID={`dl-${entry.state === 'paused' ? 'resume' : 'retry'}-${readableKey}`}
            onPress={() => void downloadReadable(readableKey, {
              serverUrl: state.creds.serverUrl, token: state.creds.token,
              ...(entry.title ? { title: entry.title } : {}),
              ...(entry.seriesName ? { seriesName: entry.seriesName } : {}),
              ...(entry.contentType ? { contentType: entry.contentType } : {}),
              coverUrl: entry.coverUrl ?? null,
              ...(entry.volumeLabel ? { volumeLabel: entry.volumeLabel } : {}),
            })}
            style={{ marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: t.surfaceMuted, borderWidth: 1, borderColor: t.border, alignSelf: 'flex-start' }}
          >
            <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12, color: t.primary }}>
              {entry.state === 'paused' ? 'Resume' : 'Retry'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Section shown above the completed list when in-flight downloads exist.
 * Groups entries by seriesName (the key in the Map) so per-series downloads
 * cluster together just like the completed list.
 */
function ActiveDownloadsSection({
  groups,
}: {
  groups: Map<string, ActiveDownload[]>;
}) {
  const t = useTokens();
  return (
    <View style={{ marginBottom: 8 }}>
      <Text
        style={{
          fontFamily: fonts.mono.regular,
          fontSize: 9.5,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: t.textMuted,
          marginTop: 16,
          marginBottom: 4,
        }}
      >
        In progress
      </Text>
      {[...groups.entries()].map(([_groupKey, items]) =>
        items.map(({ readableKey, entry }) => (
          <ActiveDownloadRow
            key={readableKey}
            readableKey={readableKey}
            entry={entry}
          />
        )),
      )}
    </View>
  );
}
