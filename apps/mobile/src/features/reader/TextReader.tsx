import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { ReaderManifest } from '@/api/schemas';
import { useReaderTheme } from './ReaderThemeContext';
import { ReaderChrome } from './ReaderChrome';
import { ProgressRail } from './ProgressRail';
import { SettingsSheet } from './SettingsSheet';
import { TOCPanel, type TOCItem } from './TOCPanel';
import { EpubWebView } from './EpubWebView';
import { MobiWebView, type FoliateLocation, type FoliateTocEntry } from './MobiWebView';
import { PdfReader } from './PdfReader';
import { spineToPosition } from './lib/position';
import { loadReaderSettings, saveReaderSettings } from './lib/reader-settings';
import { useReadingHeartbeat } from '@/api/hooks/useReadingHeartbeat';

export interface TextReaderProps {
  manifest: ReaderManifest;
  /** Leave the reader — wired to the chrome's back chevron. */
  onBack: () => void;
}

type Overlay = 'settings' | 'toc' | null;

/**
 * The text reader surface. Branches on `manifest.format`:
 *  - `pdf` → the native `PdfReader` (which owns its own chrome + rail).
 *  - `mobi`/`azw3` → a `MobiWebView` (foliate-js) hosted inside the SAME shared
 *    chrome as epub (top bar + settings + TOC + progress rail), tracking a 0..1
 *    reading fraction instead of a spine index.
 *  - everything else (epub/zip text) → an `EpubWebView` hosted inside the shared
 *    chrome.
 *
 * Both webview branches share the exact same chrome / settings / theme context /
 * reader-settings persistence; only the position model + webview content differ.
 * Native rendering is device/CI-verified.
 */
export function TextReader({ manifest, onBack }: TextReaderProps) {
  const { palette } = useReaderTheme();

  if (manifest.format === 'pdf') {
    return (
      <View testID="reader-text" style={{ flex: 1, backgroundColor: palette.page }}>
        <PdfReader manifest={manifest} onBack={onBack} />
      </View>
    );
  }

  if (manifest.format === 'mobi' || manifest.format === 'azw3') {
    return <MobiTextReader manifest={manifest} onBack={onBack} />;
  }

  return <EpubTextReader manifest={manifest} onBack={onBack} />;
}

/** Hydrate the shared text-display settings (font scale + scroll mode). */
function useTextDisplaySettings() {
  const [fontScale, setFontScaleState] = useState(1);
  const [scrollMode, setScrollMode] = useState(false);

  // Hydrate the persisted font scale + scroll mode (async; defaults render
  // meanwhile). Persisted per device under the 'text' reader kind.
  useEffect(() => {
    let cancelled = false;
    void loadReaderSettings('text').then((s) => {
      if (cancelled) return;
      if (s.fontScale !== undefined) setFontScaleState(s.fontScale);
      if (s.scrollMode !== undefined) setScrollMode(s.scrollMode);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change — saveReaderSettings debounces, so slider drags collapse.
  const setFontScale = useCallback((v: number) => {
    setFontScaleState(v);
    saveReaderSettings('text', { fontScale: v });
  }, []);
  const setScrollModePersisted = useCallback((v: boolean) => {
    setScrollMode(v);
    saveReaderSettings('text', { scrollMode: v });
  }, []);

  return { fontScale, setFontScale, scrollMode, setScrollMode: setScrollModePersisted };
}

/**
 * The MOBI / AZW3 branch — a foliate-js `MobiWebView` inside the SAME shared
 * chrome / settings / TOC / rail as the EPUB branch. Tracks a 0..1 reading
 * fraction (foliate's universal position) for the scrubber, and foliate's
 * 0-based location ({ current, total }) for the "{current+1} / {total}" rail
 * readout (falling back to percent when no location is reported yet).
 *
 * foliate's TOC is bridged from `book.toc` once the book opens; when non-empty
 * the shared `ReaderChrome` shows the TOC button and the shared `TOCPanel`
 * lists the entries. A tap navigates via `view.goTo(href)` through the WebView
 * bridge (foliate's TOC is href-addressed, not fraction-addressed).
 */
function MobiTextReader({ manifest, onBack }: TextReaderProps) {
  const { palette } = useReaderTheme();
  useReadingHeartbeat({ isActive: true, readableKey: manifest.readableKey });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const { fontScale, setFontScale, scrollMode, setScrollMode } = useTextDisplaySettings();

  // Seed the rail from the resume `{ frac }` locator so it shows the right %
  // before the first relocate arrives.
  const seedFraction = (() => {
    const loc = manifest.progress?.locator;
    if (loc && 'frac' in loc) return Math.min(1, Math.max(0, loc.frac));
    return Math.min(1, Math.max(0, manifest.progress?.position ?? 0));
  })();
  const [fraction, setFraction] = useState(seedFraction);
  // foliate's 0-based Kindle-style location, bridged on each relocate. Drives
  // the "{current+1} / {total}" rail readout; null until the first relocate.
  const [location, setLocation] = useState<FoliateLocation | null>(null);
  // foliate's flattened TOC, bridged once the book opens. Empty until then.
  const [tocItems, setTocItems] = useState<FoliateTocEntry[]>([]);
  // A scrubber seek request handed to the WebView. Null between seeks so the
  // same target can be requested twice in a row.
  const [requestedFraction, setRequestedFraction] = useState<number | null>(null);
  // A TOC href navigation request handed to the WebView. Null between jumps so
  // the same chapter can be requested twice in a row.
  const [requestedHref, setRequestedHref] = useState<string | null>(null);

  const panelItems: TOCItem[] = useMemo(
    () => tocItems.map((t) => ({ label: t.label, href: t.href, depth: t.depth })),
    [tocItems],
  );

  // "{current+1} / {total}" once foliate reports a location, else percent.
  const railLeftLabel =
    location && location.total > 0
      ? `${location.current + 1} / ${location.total}`
      : `${Math.round(fraction * 100)}%`;

  return (
    <View testID="reader-text" style={{ flex: 1, backgroundColor: palette.page }}>
      {!chromeHidden ? (
        <ReaderChrome
          title={manifest.title}
          subtitle={manifest.volumeLabel ?? manifest.author ?? undefined}
          onBack={onBack}
          onTOC={panelItems.length > 0 ? () => setOverlay('toc') : undefined}
          onSettings={() => setOverlay('settings')}
        />
      ) : null}

      <MobiWebView
        manifest={manifest}
        scrollMode={scrollMode}
        fontScale={fontScale}
        onToggleChrome={() => setChromeHidden((h) => !h)}
        onFractionChange={(f) => {
          setFraction(f);
          setRequestedFraction(null);
          setRequestedHref(null);
        }}
        onLocationChange={setLocation}
        onToc={setTocItems}
        requestedFraction={requestedFraction}
        requestedHref={requestedHref}
      />

      {!chromeHidden ? (
        <ProgressRail
          position={fraction}
          leftLabel={railLeftLabel}
          rightLabel={`${Math.round(fraction * 100)}%`}
          onScrub={(p) => {
            const clamped = Math.min(1, Math.max(0, p));
            setFraction(clamped);
            setRequestedFraction(clamped);
          }}
        />
      ) : null}

      {overlay === 'settings' ? (
        <View testID="reader-overlay-settings" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <SettingsSheet
            onDismiss={() => setOverlay(null)}
            textOptions={{ fontScale, setFontScale }}
            scrollMode={{ value: scrollMode, set: setScrollMode }}
          />
        </View>
      ) : null}

      {overlay === 'toc' ? (
        <View testID="reader-overlay-toc" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TOCPanel
            items={panelItems}
            onDismiss={() => setOverlay(null)}
            onJump={(i) => {
              const href = tocItems[i]?.href;
              if (href != null) setRequestedHref(href);
              setOverlay(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The EPUB branch — webview + the shared chrome / settings / TOC / rail. */
function EpubTextReader({ manifest, onBack }: TextReaderProps) {
  const { palette } = useReaderTheme();
  // Reading-stats heartbeat: paged reader, active while mounted.
  useReadingHeartbeat({ isActive: true, readableKey: manifest.readableKey });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const { fontScale, setFontScale, scrollMode, setScrollMode } = useTextDisplaySettings();
  const [spineIdx, setSpineIdx] = useState(0);
  // A TOC jump request handed to the WebView. Null between jumps so the WebView
  // (which reacts to value changes) can act on the same chapter twice in a row.
  const [requestedSpineIdx, setRequestedSpineIdx] = useState<number | null>(null);

  const spineCount = Math.max(1, manifest.spine?.length ?? 1);
  const position = spineToPosition(spineIdx, 0, 1, spineCount);

  const tocItems: TOCItem[] = useMemo(
    () => (manifest.toc ?? []).map((t) => ({ label: t.label })),
    [manifest.toc],
  );

  return (
    <View testID="reader-text" style={{ flex: 1, backgroundColor: palette.page }}>
      {!chromeHidden ? (
        <ReaderChrome
          title={manifest.title}
          subtitle={manifest.volumeLabel ?? manifest.author ?? undefined}
          onBack={onBack}
          onTOC={tocItems.length > 0 ? () => setOverlay('toc') : undefined}
          onSettings={() => setOverlay('settings')}
        />
      ) : null}

      <EpubWebView
        manifest={manifest}
        scrollMode={scrollMode}
        fontScale={fontScale}
        onToggleChrome={() => setChromeHidden((h) => !h)}
        onSpineChange={(idx) => {
          setSpineIdx(idx);
          // The WebView has now loaded the requested chapter; clear the request
          // so the next jump to the same index still registers as a change.
          setRequestedSpineIdx(null);
        }}
        requestedSpineIdx={requestedSpineIdx}
      />

      {!chromeHidden ? (
        <ProgressRail
          position={position}
          leftLabel={`Chapter ${spineIdx + 1} / ${spineCount}`}
          rightLabel={`${Math.round(position * 100)}%`}
        />
      ) : null}

      {overlay === 'settings' ? (
        <View testID="reader-overlay-settings" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <SettingsSheet
            onDismiss={() => setOverlay(null)}
            textOptions={{ fontScale, setFontScale }}
            scrollMode={{ value: scrollMode, set: setScrollMode }}
          />
        </View>
      ) : null}

      {overlay === 'toc' ? (
        <View testID="reader-overlay-toc" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TOCPanel
            items={tocItems}
            activeIndex={spineIdx}
            onDismiss={() => setOverlay(null)}
            onJump={(i) => {
              const target = manifest.toc?.[i]?.spineIdx ?? i;
              const clamped = Math.min(Math.max(0, target), spineCount - 1);
              // Optimistically update the progress label, then drive the WebView
              // to actually load the chapter (it reports back via onSpineChange).
              setSpineIdx(clamped);
              setRequestedSpineIdx(clamped);
              setOverlay(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
