import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useAuth } from '@/auth/AuthContext';
import { useReadingProgress } from '@/api/hooks/useReadingProgress';
import { parseReadableKey, type ReaderManifest } from '@/api/schemas';
import { useOfflineSource } from '@/state/readerDownloadsStore';
import { resolveOffline } from './lib/offline-download';
import type { ReaderPalette } from '@/theme/reader-themes';
import { useReaderTheme } from './ReaderThemeContext';
import { FOLIATE_BUNDLE_JS } from './generated/foliate-bundle';

/** Derive the libraryFileId a `page:file:<id>` readableKey addresses. */
function fileIdOf(readableKey: string): number {
  const parsed = parseReadableKey(readableKey);
  return parsed.kind === 'page' ? parsed.fileId : -1;
}

/** A flattened TOC entry bridged from foliate's nested `book.toc`. */
export interface FoliateTocEntry {
  /** Display label. */
  label: string;
  /** foliate href passed to `view.goTo(href)`. */
  href: string;
  /** Nesting depth (0 = top-level) for indentation. */
  depth: number;
}

/**
 * foliate's `relocate` 0-based Kindle-style location (available immediately on
 * each relocate). `current` is 0-based; `total` is the count.
 */
export interface FoliateLocation {
  current: number;
  total: number;
  next?: number;
}

/** Messages the WebView bootstrap posts back to RN. */
type WebViewMsg =
  | { type: 'relocate'; fraction: number; location?: FoliateLocation }
  | { type: 'toc'; entries: FoliateTocEntry[] }
  | { type: 'tap'; action: 'prev' | 'next' | 'toggle' }
  | { type: 'ready' }
  | { type: 'error'; message: string };

/**
 * The literal CSS foliate injects into its content document. RN has no CSS
 * variables crossing the WebView boundary, so — exactly like `EpubWebView` and
 * the web `FoliateSurface` — we bake the resolved palette + font scale into the
 * stylesheet. `setStyles` is re-applied live on a theme/font change.
 */
function buildFoliateCss(palette: ReaderPalette, fontScale: number): string {
  const ink = palette.ink;
  const pageBg = palette.page;
  const accent = palette.accent;
  const fontSize = Math.round(17 * fontScale);
  return `
    html, body {
      color: ${ink} !important;
      background: ${pageBg} !important;
      font-size: ${fontSize}px !important;
      line-height: 1.6 !important;
    }
    body, p, li, blockquote, dd { line-height: 1.6 !important; }
    a { color: ${accent} !important; }
    img, svg, video { max-width: 100% !important; height: auto !important; }
  `;
}

/**
 * Build the WebView HTML document: the inlined foliate-js bundle (which
 * registers `<foliate-view>`) plus a bootstrap that opens the book, resumes,
 * and bridges nav/settings/relocate over `window.ReactNativeWebView`.
 *
 * The raw ebook is obtained two ways:
 *  - ONLINE: fetched from the download route with the scoped `?token=` (the
 *    WebView can't forward the bearer header to a sub-resource — mirror the
 *    `EpubWebView` token-in-URL contract). A no-referrer policy keeps the
 *    token out of the Referer header.
 *  - OFFLINE: the RN side reads the cached file as base64 and seeds it into
 *    `window.__BOOK_B64` (injected before this script runs). The bootstrap
 *    decodes it to a Blob so foliate opens local bytes — no network.
 *
 * foliate's `view.open()` expects a File/Blob (it calls `.slice()`/`.size`), so
 * we always wrap the bytes in a Blob.
 */
function buildHtml(opts: {
  downloadUrl: string;
  resourceToken: string;
  initialFraction: number;
  css: string;
  flow: 'paginated' | 'scrolled';
}): string {
  const { downloadUrl, resourceToken, initialFraction, css, flow } = opts;
  const cfg = JSON.stringify({ downloadUrl, resourceToken, initialFraction, css, flow });
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta name="referrer" content="no-referrer" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
  foliate-view { display: block; width: 100%; height: 100vh; }
</style>
<script>${FOLIATE_BUNDLE_JS}</script>
</head>
<body>
<script>
(function(){
  var CFG = ${cfg};
  var post = function(m){ try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} };
  var view = null;

  // Tap zones over the whole surface: left 30% = prev, right 30% = next, middle
  // = toggle chrome. RTL flips prev/next (foliate exposes book.dir).
  document.addEventListener('click', function(e){
    var w = window.innerWidth; if (w <= 0) return;
    var rel = e.clientX / w;
    var rtl = view && view.book && view.book.dir === 'rtl';
    var action = rel < 0.3 ? (rtl ? 'next' : 'prev') : (rel > 0.7 ? (rtl ? 'prev' : 'next') : 'toggle');
    post({ type: 'tap', action: action });
  }, true);

  // Commands pushed from RN via injectJavaScript → window.__rdCmd(...).
  window.__rdCmd = function(cmd){
    if (!view) return;
    try {
      if (cmd.kind === 'next') view.next();
      else if (cmd.kind === 'prev') view.prev();
      else if (cmd.kind === 'goToFraction') view.goToFraction(Math.min(1, Math.max(0, cmd.frac)));
      else if (cmd.kind === 'goToHref') { if (cmd.href) view.goTo(cmd.href); }
      else if (cmd.kind === 'setStyles') { if (view.renderer && view.renderer.setStyles) view.renderer.setStyles(cmd.css); }
      else if (cmd.kind === 'setFlow') { if (view.renderer) view.renderer.setAttribute('flow', cmd.flow); }
    } catch(e){}
  };

  function b64ToBlob(b64){
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes]);
  }

  async function loadBytes(){
    if (window.__BOOK_B64) return b64ToBlob(window.__BOOK_B64);
    var url = CFG.downloadUrl;
    if (CFG.resourceToken) {
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(CFG.resourceToken);
    }
    var res = await fetch(url);
    if (!res.ok) throw new Error('download HTTP ' + res.status);
    return await res.blob();
  }

  (async function(){
    try {
      var blob = await loadBytes();
      var el = document.createElement('foliate-view');
      document.body.appendChild(el);
      view = el;
      el.addEventListener('relocate', function(e){
        var d = e && e.detail ? e.detail : {};
        var f = d.fraction;
        if (typeof f === 'number') {
          var m = { type: 'relocate', fraction: f };
          // location: { current, next, total } — 0-based Kindle-style, present
          // immediately, drives the "{current+1} / {total}" rail readout.
          if (d.location && typeof d.location.total === 'number') m.location = d.location;
          post(m);
        }
      });
      await el.open(blob);
      // After open, book.toc is a nested [{ label, href, subitems? }]. Flatten
      // it (depth-tracked) and bridge it so RN can populate the shared TOCPanel.
      try {
        var toc = el.book && el.book.toc;
        if (toc && toc.length) {
          var entries = [];
          (function walk(items, depth){
            for (var i = 0; i < items.length; i++) {
              var it = items[i];
              if (it && it.label != null && it.href != null) {
                entries.push({ label: String(it.label).trim(), href: String(it.href), depth: depth });
              }
              if (it && it.subitems && it.subitems.length) walk(it.subitems, depth + 1);
            }
          })(toc, 0);
          if (entries.length) post({ type: 'toc', entries: entries });
        }
      } catch (e2) {}
      el.renderer.setAttribute('flow', CFG.flow);
      if (el.renderer.setStyles) el.renderer.setStyles(CFG.css);
      var seed = CFG.initialFraction;
      if (seed > 0) await el.goToFraction(Math.min(1, Math.max(0, seed)));
      else await el.renderer.next();
      post({ type: 'ready' });
    } catch (err) {
      post({ type: 'error', message: String(err && err.message || err) });
    }
  })();
})();
</script>
</body>
</html>`;
}

export interface MobiWebViewProps {
  manifest: ReaderManifest;
  /** Toggle the reader chrome (taps in the middle zone). */
  onToggleChrome: () => void;
  /** Scroll-mode fallback (continuous scroll instead of paginated). */
  scrollMode: boolean;
  /** Font scale, mirrors the SettingsSheet text option (0.8..1.6). */
  fontScale: number;
  /** Reports the current 0..1 reading fraction (for the progress rail). */
  onFractionChange?: (frac: number) => void;
  /** Reports foliate's 0-based location ({ current, total }) for the rail. */
  onLocationChange?: (loc: FoliateLocation) => void;
  /** Reports the flattened TOC once foliate has opened the book. */
  onToc?: (entries: FoliateTocEntry[]) => void;
  /**
   * A scrubber-driven fraction request from the parent. When this changes to a
   * non-null value, the WebView seeks there. The parent resets it to `null`
   * after so re-requesting the same fraction registers as a change.
   */
  requestedFraction?: number | null;
  /**
   * A TOC-driven href navigation request from the parent. When this changes to
   * a non-null value, the WebView calls `view.goTo(href)`. The parent resets it
   * to `null` after so re-requesting the same href registers as a change.
   */
  requestedHref?: string | null;
}

/**
 * Renders a MOBI / AZW3 ebook with foliate-js inside a `react-native-webview`.
 *
 * The whole file streams from `/api/reader/ebook/<fileId>/download` (authed by
 * the scoped `epubResourceToken` in the URL — the WebView can't forward the
 * bearer header), or is read from the offline cache as base64. foliate parses
 * both Mobipocket and KF8/AZW3 from the raw bytes. Reading position is reported
 * as a 0..1 `relocate` fraction and committed as a `{ frac }` locator; the
 * resume seed comes from the manifest's `{ frac }` locator. Theme/font/scroll
 * mode are injected via `renderer.setStyles` / `setAttribute('flow', …)`,
 * mirroring `EpubWebView`'s literal-palette injection.
 *
 * Native rendering + foliate are device/CI-verified; jest mocks the WebView to
 * a View that surfaces `source` / `injectedJavaScript` / `onMessage`.
 */
export function MobiWebView({
  manifest,
  onToggleChrome,
  scrollMode,
  fontScale,
  onFractionChange,
  onLocationChange,
  onToc,
  requestedFraction,
  requestedHref,
}: MobiWebViewProps) {
  const { palette } = useReaderTheme();
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  // The short-lived, {fileId,userId}-scoped token for the download ?token= auth.
  // We never put the account bearer in a URL.
  const resourceToken = manifest.epubResourceToken ?? '';

  const fileId = useMemo(() => fileIdOf(manifest.readableKey), [manifest.readableKey]);

  const { progress, commit } = useReadingProgress(
    manifest.readableKey,
    {
      seriesId: manifest.seriesId,
      volumeId: manifest.volumeId ?? null,
      contentType: manifest.contentType,
    },
    manifest.progress,
  );

  // Seed the resume fraction from the `{ frac }` locator (else 0 → first page).
  const seedFraction = useMemo(() => {
    const loc = progress?.locator;
    if (loc && 'frac' in loc) return Math.min(1, Math.max(0, loc.frac));
    return Math.min(1, Math.max(0, progress?.position ?? 0));
  }, [progress]);

  // Prefer the offline-downloaded copy (a single `book.<fmt>`). When present we
  // read it as base64 and seed `window.__BOOK_B64` so foliate opens local bytes.
  //
  // `offlineResolved` gates the WebView mount: reading a multi-MB file as base64
  // is async and would otherwise LOSE the race against the WebView's first load,
  // so the bootstrap would fall through to a network fetch (failing offline).
  // We therefore hold the mount until the offline read settles (success OR
  // failure) so the document's very first load already carries the bytes. When
  // there's no offline copy, it resolves immediately and we mount online.
  const offlinePaths = useOfflineSource(manifest.readableKey);
  const offlinePath = offlinePaths?.[0] ?? null;
  const [bookB64, setBookB64] = useState<string | null>(null);
  const [offlineResolved, setOfflineResolved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setBookB64(null);
    setOfflineResolved(false);
    if (!offlinePath) {
      setOfflineResolved(true);
      return;
    }
    void ReactNativeBlobUtil.fs
      .readFile(resolveOffline(offlinePath), 'base64')
      .then((b64) => {
        if (!cancelled) {
          setBookB64(typeof b64 === 'string' ? b64 : null);
          setOfflineResolved(true);
        }
      })
      .catch(() => {
        // A failed offline read falls back to the network fetch on mount.
        if (!cancelled) setOfflineResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [offlinePath]);

  const css = useMemo(() => buildFoliateCss(palette, fontScale), [palette, fontScale]);
  const flow: 'paginated' | 'scrolled' = scrollMode ? 'scrolled' : 'paginated';

  const downloadUrl = `${serverUrl}/api/reader/ebook/${fileId}/download`;

  // Build the HTML once per file/auth. Settings (css/flow) are applied live via
  // injectJavaScript, so they are intentionally NOT in this memo's deps — a
  // theme change must not reload the document and re-parse the whole book.
  const html = useMemo(
    () =>
      buildHtml({
        downloadUrl,
        resourceToken,
        initialFraction: seedFraction,
        css,
        flow,
      }),
    // Settings (css/flow) are applied live via injectJavaScript, so they are
    // intentionally excluded here — a theme change must not reload the document
    // and re-parse the whole book.
    [downloadUrl, resourceToken, seedFraction],
  );

  // Inject the offline bytes BEFORE the document scripts run (so the bootstrap
  // finds `window.__BOOK_B64`). When online, this is empty and the bootstrap
  // fetches over the network. The WebView mount is gated on `offlineResolved`,
  // so by the time it first loads this already carries the bytes (if any).
  const injectedJavaScriptBeforeContentLoaded = useMemo(() => {
    if (!bookB64) return undefined;
    return `window.__BOOK_B64 = ${JSON.stringify(bookB64)}; true;`;
  }, [bookB64]);

  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const [failed, setFailed] = useState(false);

  // On every (re)load the bootstrap re-runs from scratch: clear `ready` so the
  // live-settings effects below don't inject against a document whose
  // `window.__rdCmd` isn't defined yet (mirrors EpubWebView's loadedRef reset),
  // and clear any prior error.
  const onLoadStart = useCallback(() => {
    readyRef.current = false;
    setFailed(false);
  }, []);

  // Apply a theme/font change live: re-inject the resolved stylesheet.
  useEffect(() => {
    if (!readyRef.current) return;
    webRef.current?.injectJavaScript(
      `window.__rdCmd && window.__rdCmd({ kind: 'setStyles', css: ${JSON.stringify(css)} }); true;`,
    );
  }, [css]);

  // Apply a scroll-mode toggle live: switch the foliate flow.
  useEffect(() => {
    if (!readyRef.current) return;
    webRef.current?.injectJavaScript(
      `window.__rdCmd && window.__rdCmd({ kind: 'setFlow', flow: ${JSON.stringify(flow)} }); true;`,
    );
  }, [flow]);

  // A scrubber seek from the parent.
  useEffect(() => {
    if (requestedFraction == null || !readyRef.current) return;
    const f = Math.min(1, Math.max(0, requestedFraction));
    webRef.current?.injectJavaScript(
      `window.__rdCmd && window.__rdCmd({ kind: 'goToFraction', frac: ${f} }); true;`,
    );
  }, [requestedFraction]);

  // A TOC href navigation from the parent.
  useEffect(() => {
    if (requestedHref == null || !readyRef.current) return;
    webRef.current?.injectJavaScript(
      `window.__rdCmd && window.__rdCmd({ kind: 'goToHref', href: ${JSON.stringify(requestedHref)} }); true;`,
    );
  }, [requestedHref]);

  // A `baseUrl` is only set when we have a server origin (so relative URLs +
  // the document origin resolve sensibly); omitted entirely otherwise to satisfy
  // `exactOptionalPropertyTypes`.
  const source = useMemo(
    () => (serverUrl ? { html, baseUrl: serverUrl } : { html }),
    [html, serverUrl],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: WebViewMsg;
      try {
        msg = JSON.parse(e.nativeEvent.data) as WebViewMsg;
      } catch {
        return;
      }
      if (msg.type === 'relocate') {
        const frac = Math.min(1, Math.max(0, msg.fraction));
        onFractionChange?.(frac);
        if (msg.location) onLocationChange?.(msg.location);
        commit(frac, { frac });
      } else if (msg.type === 'toc') {
        if (Array.isArray(msg.entries)) onToc?.(msg.entries);
      } else if (msg.type === 'tap') {
        if (msg.action === 'next') webRef.current?.injectJavaScript("window.__rdCmd && window.__rdCmd({ kind: 'next' }); true;");
        else if (msg.action === 'prev') webRef.current?.injectJavaScript("window.__rdCmd && window.__rdCmd({ kind: 'prev' }); true;");
        else onToggleChrome();
      } else if (msg.type === 'ready') {
        readyRef.current = true;
      } else if (msg.type === 'error') {
        // Download/parse failure (corrupt file, unsupported variant, offline
        // miss): surface a readable state instead of a blank page (parity with
        // the web FoliateSurface).
        setFailed(true);
      }
    },
    [commit, onFractionChange, onLocationChange, onToc, onToggleChrome],
  );

  return (
    <View testID="reader-mobi" style={{ flex: 1, backgroundColor: palette.page }}>
      {failed ? (
        <View
          testID="reader-mobi-error"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
        >
          <Text style={{ color: palette.ink, textAlign: 'center' }}>
            This book couldn’t be opened. The file may be corrupt or an unsupported variant.
          </Text>
        </View>
      ) : offlineResolved ? (
        <WebView
          ref={webRef}
          // `originWhitelist` ['*'] lets the inline-HTML document issue the
          // cross-origin fetch to the app server for the raw ebook bytes.
          originWhitelist={['*']}
          source={source}
          {...(injectedJavaScriptBeforeContentLoaded
            ? { injectedJavaScriptBeforeContentLoaded }
            : {})}
          onLoadStart={onLoadStart}
          onMessage={onMessage}
          scrollEnabled={scrollMode}
          style={{ flex: 1, backgroundColor: palette.page }}
        />
      ) : null}
    </View>
  );
}
