import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Dimensions,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import FastImage, { type FastImageProps } from 'react-native-fast-image';
import { FlashList } from '@shopify/flash-list';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useAuth } from '@/auth/AuthContext';
import { useOfflineSource, toFileUri } from '@/state/readerDownloadsStore';
import { resolveOffline } from './lib/offline-download';
import { useReadingProgress } from '@/api/hooks/useReadingProgress';
import { useReadingHeartbeat } from '@/api/hooks/useReadingHeartbeat';
import { parseReadableKey, type ReaderManifest } from '@/api/schemas';
import { text } from '@/theme/typography';
import { useReaderTheme } from './ReaderThemeContext';
import { ReaderChrome } from './ReaderChrome';
import { ProgressRail } from './ProgressRail';
import { SettingsSheet, type ComicsOptions } from './SettingsSheet';
import { TOCPanel, type TOCItem } from './TOCPanel';
import { pageToPosition, positionToPage } from './lib/position';
import { nextIndex, prevIndex, tapAction, pagePair } from './lib/comics-nav';
import { ZOOM_MIN, clampZoom, toggleZoom } from './lib/zoom';
import { loadReaderSettings, saveReaderSettings } from './lib/reader-settings';

/** A FastImage source for a page: a bearer-authed network URL, or a local file. */
type PageSource = { uri: string; headers?: Record<string, string> };

/**
 * A page image that self-heals: if its primary source fails to load (e.g. a
 * stale offline `file://` path whose file was deleted out from under the
 * persisted download entry), it falls back to the network source so the page
 * still renders instead of going black. The error flag resets whenever the
 * primary source URI changes (i.e. on a page turn).
 */
function PageImage({
  source,
  fallback,
  testID,
  style,
  retryNonce = 0,
  onStatus,
}: {
  source: PageSource;
  fallback?: PageSource | undefined;
  testID: string;
  style: FastImageProps['style'];
  /** Bumped to force a re-fetch of a network page (cache-busts the URL). */
  retryNonce?: number | undefined;
  /** Reports whether the page ultimately loaded ('ok') or failed both sources
   * ('error') — drives the reader's "waiting for server" overlay. */
  onStatus?: ((status: 'ok' | 'error') => void) | undefined;
}) {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [source.uri]);
  // Append the retry nonce to a network URL so FastImage re-requests it instead
  // of serving the cached failure. Local file:// sources are left untouched.
  const withNonce = (s: PageSource): PageSource =>
    retryNonce > 0 && /^https?:/i.test(s.uri)
      ? { ...s, uri: `${s.uri}${s.uri.includes('?') ? '&' : '?'}__retry=${retryNonce}` }
      : s;
  const active = withNonce(errored && fallback ? fallback : source);
  return (
    <FastImage
      testID={testID}
      source={active}
      resizeMode={FastImage.resizeMode.contain}
      style={style}
      onLoad={() => onStatus?.('ok')}
      onError={() => {
        // Try the fallback (network) once; if that also fails, it's a real
        // load failure (server unavailable).
        if (fallback && !errored) setErrored(true);
        else onStatus?.('error');
      }}
    />
  );
}

/**
 * A pinch-to-zoom + pan + double-tap page. Pinch scales 1..3; once zoomed, a
 * one-finger pan moves the page and double-tap toggles 1×↔2×. While zoomed the
 * caller suppresses tap-zone paging via `onZoomChange`. Gesture wiring is
 * device-verified (jest mocks gesture-handler/reanimated to inert pass-throughs);
 * the pure clamp/toggle math lives in `lib/zoom.ts` and is unit-tested.
 */
function ZoomablePage({
  source,
  fallbackSource,
  onZoomChange,
  retryNonce,
  onStatus,
}: {
  source: PageSource;
  fallbackSource?: PageSource | undefined;
  onZoomChange: (zoomed: boolean) => void;
  retryNonce?: number;
  onStatus?: ((status: 'ok' | 'error') => void) | undefined;
}) {
  const scale = useSharedValue(ZOOM_MIN);
  const startScale = useSharedValue(ZOOM_MIN);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const report = useCallback((z: number) => onZoomChange(z > ZOOM_MIN), [onZoomChange]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = clampZoom(startScale.value * e.scale);
    })
    .onEnd(() => {
      if (scale.value <= ZOOM_MIN) {
        scale.value = ZOOM_MIN;
        tx.value = 0;
        ty.value = 0;
      }
      runOnJS(report)(scale.value);
    });

  const pan = Gesture.Pan()
    .enabled(scale.value > ZOOM_MIN)
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate((e) => {
      if (scale.value <= ZOOM_MIN) return;
      tx.value = startX.value + e.translationX;
      ty.value = startY.value + e.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const nextScale = toggleZoom(scale.value);
      scale.value = nextScale;
      if (nextScale <= ZOOM_MIN) {
        tx.value = 0;
        ty.value = 0;
      }
      runOnJS(report)(nextScale);
    });

  const gesture = Gesture.Simultaneous(pinch, Gesture.Race(doubleTap, pan));

  // Animate ONLY the transform. Layout (flex/width) must be static — a string
  // like width:'100%' inside useAnimatedStyle segfaults reanimated's node
  // manager (REANodesManager performOperations). The static width also makes the
  // page actually fill its centered parent instead of collapsing to zero width.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1, width: '100%' }, animatedStyle]}>
        <PageImage
          testID="reader-comic-page"
          source={source}
          fallback={fallbackSource}
          retryNonce={retryNonce}
          onStatus={onStatus}
          style={{ width: '100%', height: '100%' }}
        />
      </Animated.View>
    </GestureDetector>
  );
}

/** Width:height ratio past which a device is "wide" enough for a two-up spread. */
const SPREAD_MIN_RATIO = 1;

export interface ComicsReaderProps {
  manifest: ReaderManifest;
  /** Leave the reader — wired to the chrome's back chevron. */
  onBack: () => void;
  /** Called when the user pages forward past the last page (book finished). */
  onReachedEnd?: () => void;
  /** Leave the reader for the Home dashboard — Cancel on the server-down overlay. */
  onExitToHome?: () => void;
}

type Overlay = 'settings' | 'toc' | null;
type Spread = ComicsOptions['spread'];
type Direction = ComicsOptions['direction'];

/** Derive the libraryFileId a `page:file:<id>` readableKey addresses. */
function fileIdOf(readableKey: string): number {
  const parsed = parseReadableKey(readableKey);
  return parsed.kind === 'page' ? parsed.fileId : -1;
}

/**
 * The comics image reader: a paged single-page view (tap zones drive paging,
 * RTL-aware) plus a vertical webtoon scroll, both pulling real backend page
 * renders from `/api/reader/comics/<fileId>/page/<n>`. Page images are served
 * behind the session bearer, so every `FastImage` source carries the
 * `Authorization` header from the auth context.
 *
 * Index ⇄ position runs through `position.ts`; a page turn debounce-commits the
 * new position via `useReadingProgress`. The reader owns its own chrome
 * (`ReaderChrome` top bar, always-on `ProgressRail`, `SettingsSheet`,
 * `TOCPanel`) so the surface is self-contained; the shell only seeds the theme.
 *
 * Layout notes:
 * - Two-up spread (settings → "Spread") renders side-by-side only on a wide /
 *   landscape viewport (`useWindowDimensions`); on a narrow/portrait phone it
 *   falls back to single, since two portrait pages are illegible at phone width.
 * - Single-page view supports pinch-to-zoom + pan + double-tap (1×↔2×) via
 *   `ZoomablePage` (gesture-handler + reanimated). The gesture WIRING is
 *   device-verified; the pure clamp/toggle math is unit-tested in `lib/zoom.ts`.
 */
export function ComicsReader({ manifest, onBack, onReachedEnd, onExitToHome }: ComicsReaderProps) {
  const { palette } = useReaderTheme();
  const { state } = useAuth();
  const token = state.status === 'authenticated' ? state.creds.token : '';
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';

  const fileId = useMemo(() => fileIdOf(manifest.readableKey), [manifest.readableKey]);
  const pageCount = Math.max(1, manifest.pageCount ?? 1);

  const { progress, commit } = useReadingProgress(
    manifest.readableKey,
    {
      seriesId: manifest.seriesId,
      volumeId: manifest.volumeId ?? null,
      contentType: manifest.contentType,
    },
    manifest.progress,
  );

  // Seed the starting page from the resume locator (a page number) or, failing
  // that, the normalized position.
  const seedIdx = (() => {
    const loc = progress?.locator;
    if (loc && 'page' in loc) return Math.min(Math.max(0, loc.page), pageCount - 1);
    return positionToPage(progress?.position ?? 0, pageCount);
  })();

  const [idx, setIdx] = useState(seedIdx);
  const [spread, setSpreadState] = useState<Spread>('single');
  const [direction, setDirectionState] = useState<Direction>(
    manifest.contentType === 'manga' ? 'rtl' : 'ltr',
  );

  // Hydrate the persisted spread + direction once, after mount. The
  // content-type seed (manga→rtl) above renders meanwhile; an explicit stored
  // pick (only written once the user changes a setting) takes precedence so the
  // choice survives reopen / relaunch. Persisted per device, per reader kind.
  useEffect(() => {
    let cancelled = false;
    void loadReaderSettings('comics').then((s) => {
      if (cancelled) return;
      if (s.spread !== undefined) setSpreadState(s.spread);
      if (s.direction !== undefined) setDirectionState(s.direction);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change (debounced inside saveReaderSettings).
  const setSpread = useCallback((v: Spread) => {
    setSpreadState(v);
    saveReaderSettings('comics', { spread: v });
  }, []);
  const setDirection = useCallback((v: Direction) => {
    setDirectionState(v);
    saveReaderSettings('comics', { direction: v });
  }, []);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  // True while the active page is pinch-zoomed in — suppresses tap-zone paging.
  const [zoomed, setZoomed] = useState(false);
  // The active page couldn't be fetched (server unavailable) — shows the
  // "waiting for server" overlay. `retryNonce` cache-busts the page URL so a
  // retry actually re-requests it.
  const [serverDown, setServerDown] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const onPageStatus = useCallback((s: 'ok' | 'error') => {
    setServerDown(s === 'error');
  }, []);

  // Reading-stats heartbeat: active while mounted. Units = pages newly reached
  // since the previous heartbeat.
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const lastUnitPageRef = useRef(idx);
  const getPageUnitDelta = useCallback((): number => {
    const delta = idxRef.current - lastUnitPageRef.current;
    if (delta <= 0) return 0;
    lastUnitPageRef.current = idxRef.current;
    return delta;
  }, []);
  useReadingHeartbeat({
    isActive: true,
    getUnitDelta: getPageUnitDelta,
    readableKey: manifest.readableKey,
  });

  const rtl = direction === 'rtl';
  const webtoon = spread === 'webtoon';

  // Two-up spread only renders side-by-side on a wide/landscape viewport; on a
  // narrow/portrait phone it falls back to single (the page is too tall to show
  // two legibly). `useWindowDimensions` re-renders on rotation.
  const { width: winW, height: winH } = useWindowDimensions();
  const wide = winW / Math.max(1, winH) >= SPREAD_MIN_RATIO;
  const isDouble = spread === 'spread' && wide;

  // If this readable has been downloaded for offline reading, its per-page image
  // paths live here (page n at index n); otherwise null and we stream.
  const offlinePaths = useOfflineSource(manifest.readableKey);

  // Build a FastImage source for a 0-based page index: the local `file://` copy
  // when offline-downloaded, else the bearer-authed serving route.
  // resolveOffline() converts stored relative paths to absolute before toFileUri().
  const pageSource = useCallback(
    (n: number) => {
      const local = offlinePaths?.[n];
      if (local) return { uri: toFileUri(resolveOffline(local)) };
      return {
        uri: `${serverUrl}/api/reader/comics/${fileId}/page/${n}`,
        headers: { Authorization: `Bearer ${token}` },
      };
    },
    [offlinePaths, serverUrl, fileId, token],
  );

  // Network fallback for a page that primarily resolves to an offline file —
  // used when that file is missing (e.g. a deleted offline copy left a stale
  // download entry). Undefined when the primary source IS already the network.
  const pageFallback = useCallback(
    (n: number): PageSource | undefined => {
      if (!offlinePaths?.[n]) return undefined;
      return {
        uri: `${serverUrl}/api/reader/comics/${fileId}/page/${n}`,
        headers: { Authorization: `Bearer ${token}` },
      };
    },
    [offlinePaths, serverUrl, fileId, token],
  );

  // Move to a clamped page index and debounce-commit the new position.
  const goIdx = useCallback(
    (n: number) => {
      const clamped = Math.min(Math.max(0, n), pageCount - 1);
      setIdx(clamped);
      commit(pageToPosition(clamped, pageCount), { page: clamped });
    },
    [commit, pageCount],
  );

  const step = isDouble ? 2 : 1;
  const next = useCallback(() => {
    // Paging forward past the last page = the book is finished → hand off to the
    // finish flow (next-volume prompt / back to dashboard) instead of clamping.
    if (idx >= pageCount - 1) {
      onReachedEnd?.();
      return;
    }
    goIdx(nextIndex(idx, pageCount, step));
  }, [goIdx, idx, pageCount, step, onReachedEnd]);
  const prev = useCallback(() => goIdx(prevIndex(idx, pageCount, step)), [goIdx, idx, pageCount, step]);

  // Reset the zoom-suppression flag whenever the page or layout changes.
  const onZoomChange = useCallback((z: boolean) => setZoomed(z), []);

  // Each new page gets a clean slate; while the server is unreachable, retry the
  // fetch every 15s (bumping the nonce cache-busts the page URL).
  useEffect(() => {
    setServerDown(false);
  }, [idx]);
  useEffect(() => {
    if (!serverDown) return;
    const t = setInterval(() => setRetryNonce((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [serverDown]);

  // Gate the "waiting for server" overlay behind a 1s delay so a page that
  // errors-then-recovers quickly (a transient blip) never flashes it.
  const [showServerDown, setShowServerDown] = useState(false);
  useEffect(() => {
    if (!serverDown) {
      setShowServerDown(false);
      return;
    }
    const t = setTimeout(() => setShowServerDown(true), 1000);
    return () => clearTimeout(t);
  }, [serverDown]);

  // Webtoon progress: persist the first visible page as the reader scrolls.
  // FlashList requires `onViewableItemsChanged` / `viewabilityConfig` to be
  // referentially stable for the list's lifetime, so the handler is held in a
  // ref and reads the latest `goIdx` through another ref to avoid going stale.
  const goIdxRef = useRef(goIdx);
  goIdxRef.current = goIdx;
  const pageCountRef = useRef(pageCount);
  pageCountRef.current = pageCount;
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const indices = viewableItems
      .map((v) => v.index)
      .filter((i): i is number => i != null);
    if (indices.length === 0) return;
    // When the final page scrolls into view, the reader has reached the end —
    // commit the LAST page so position hits 1.0 and the readable is marked
    // finished. Otherwise the bottom of a webtoon would only ever report the
    // first-visible page (~0.98), never crossing the finished threshold.
    const last = pageCountRef.current - 1;
    if (Math.max(...indices) >= last) {
      goIdxRef.current(last);
      return;
    }
    goIdxRef.current(Math.min(...indices));
  }).current;

  // Tap-zone + swipe nav, both resolved on the SAME press so they can't double-
  // fire (a gesture-handler swipe layered over the Pressable's onPress was
  // turning the page forward then back). Tap zones: left/right navigate, centre
  // toggles chrome. A press whose release travelled far enough horizontally is a
  // swipe and turns the page by direction.
  const SWIPE_MIN_PX = 56;
  const overlayWidth = useRef(0);
  const pressStartXRef = useRef<number | null>(null);
  const onOverlayLayout = (e: LayoutChangeEvent) => {
    overlayWidth.current = e.nativeEvent.layout.width;
  };
  const onOverlayPressIn = useCallback((e: GestureResponderEvent) => {
    pressStartXRef.current = e.nativeEvent.locationX;
  }, []);
  const onOverlayPress = useCallback(
    (e: GestureResponderEvent) => {
      // Paging is disabled while the page is pinch-zoomed in.
      if (zoomed) return;
      const w = overlayWidth.current;
      const x = e.nativeEvent.locationX;
      const startX = pressStartXRef.current;
      pressStartXRef.current = null;

      // Swipe: enough horizontal travel turns the page (direction-aware for RTL).
      if (startX !== null && Math.abs(x - startX) >= SWIPE_MIN_PX) {
        const movedLeft = x < startX;
        const forward = rtl ? !movedLeft : movedLeft;
        if (forward) next();
        else prev();
        return;
      }

      // Tap zone.
      if (w <= 0) {
        setChromeHidden((h) => !h);
        return;
      }
      const action = tapAction(x / w, rtl);
      if (action === 'toggle') setChromeHidden((h) => !h);
      else if (action === 'forward') next();
      else prev();
    },
    [rtl, next, prev, zoomed],
  );

  const position = pageToPosition(idx, pageCount);

  const tocItems: TOCItem[] = useMemo(
    () =>
      (manifest.chapters ?? []).map((c) =>
        c.startPage !== undefined
          ? { label: c.title, detail: `p.${c.startPage + 1}` }
          : { label: c.title },
      ),
    [manifest.chapters],
  );

  return (
    <View testID="reader-comics" style={{ flex: 1, backgroundColor: palette.page }}>
      {!chromeHidden ? (
        <ReaderChrome
          title={manifest.title}
          subtitle={manifest.volumeLabel ?? manifest.author ?? undefined}
          onBack={onBack}
          onTOC={tocItems.length > 0 ? () => setOverlay('toc') : undefined}
          onSettings={() => setOverlay('settings')}
        />
      ) : null}

      {webtoon ? (
        <FlashList
          testID="reader-webtoon"
          data={Array.from({ length: pageCount }, (_, i) => i)}
          keyExtractor={(n) => String(n)}
          // FlashList only re-renders its materialized cells when `data` or
          // `extraData` changes. `renderItem` builds each page's source from
          // `offlinePaths` (a closure, not part of `data`), so without this the
          // already-rendered pages keep streaming from the server when an
          // offline download lands mid-session — they only switch to the local
          // copy on remount. Tying `extraData` to `offlinePaths` re-renders the
          // visible pages to their `file://` copies the instant the download completes.
          extraData={offlinePaths}
          // FlashList v2 auto-measures item sizes (the v1 `estimatedItemSize`
          // prop was removed); a portrait page is ~1.5× the screen width, which
          // the engine learns on first layout. `drawDistance` keeps roughly a
          // screen-and-a-half of pages rendered ahead for smooth webtoon scroll.
          drawDistance={Math.round(Dimensions.get('window').width * 1.5)}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <PageImage
              testID={`reader-webtoon-page-${item}`}
              source={pageSource(item)}
              fallback={pageFallback(item)}
              style={{ width: '100%', aspectRatio: 2 / 3 }}
            />
          )}
        />
      ) : (
        <Pressable
          testID="reader-tap-overlay"
          onLayout={onOverlayLayout}
          onPressIn={onOverlayPressIn}
          onPress={onOverlayPress}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          {isDouble ? (
            // Two-up spread (landscape/wide only): pages ordered by direction.
            // Pinch-zoom is single-page only; the spread is a fixed two-up view.
            <View
              testID="reader-comic-spread"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
            >
              {pagePair(idx, rtl)
                .filter((p) => p >= 0 && p < pageCount)
                .map((p) => (
                  <PageImage
                    key={p}
                    testID={`reader-comic-page-${p}`}
                    source={pageSource(p)}
                    fallback={pageFallback(p)}
                    style={{ flex: 1, height: '100%' }}
                  />
                ))}
            </View>
          ) : (
            <ZoomablePage
              source={pageSource(idx)}
              fallbackSource={pageFallback(idx)}
              onZoomChange={onZoomChange}
              retryNonce={retryNonce}
              onStatus={onPageStatus}
            />
          )}
        </Pressable>
      )}

      {!chromeHidden ? (
        <ProgressRail
          position={position}
          leftLabel={`Page ${idx + 1} / ${pageCount}`}
          rightLabel={`${Math.round(position * 100)}%`}
          onScrub={(p) => goIdx(positionToPage(p, pageCount))}
        />
      ) : null}

      {overlay === 'settings' ? (
        <View testID="reader-overlay-settings" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <SettingsSheet
            onDismiss={() => setOverlay(null)}
            comicsOptions={{ spread, setSpread, direction, setDirection }}
          />
        </View>
      ) : null}

      {overlay === 'toc' ? (
        <View testID="reader-overlay-toc" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TOCPanel
            items={tocItems}
            onDismiss={() => setOverlay(null)}
            onJump={(i) => {
              const startPage = manifest.chapters?.[i]?.startPage ?? 0;
              goIdx(startPage);
              setOverlay(null);
            }}
          />
        </View>
      ) : null}

      {pageCount <= 0 ? (
        <Text style={[text.monoSm, { color: palette.faint }]}>No pages</Text>
      ) : null}

      {/* Server-unavailable overlay: a page couldn't be fetched. Shown only
          after a 1s delay (showServerDown) so a transient blip doesn't flash it.
          We auto-retry every 15s (the effect bumps retryNonce); Cancel → Home. */}
      {showServerDown ? (
        <View
          testID="reader-server-down"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            paddingHorizontal: 32,
            backgroundColor: palette.page,
          }}
        >
          <ActivityIndicator color={palette.accent} />
          <Text style={[text.label, { color: palette.ink, textAlign: 'center' }]}>
            Waiting for server…
          </Text>
          <Text style={[text.monoSm, { color: palette.faint, textAlign: 'center' }]}>
            Retrying every 15 seconds
          </Text>
          <Pressable
            testID="reader-server-down-cancel"
            onPress={() => onExitToHome?.()}
            style={{
              marginTop: 8,
              paddingVertical: 10,
              paddingHorizontal: 22,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: palette.faint,
            }}
          >
            <Text style={[text.label, { color: palette.ink }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
