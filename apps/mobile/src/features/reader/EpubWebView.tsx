import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useAuth } from '@/auth/AuthContext';
import { useReadingProgress } from '@/api/hooks/useReadingProgress';
import { parseReadableKey, type ReaderManifest, type SpineItem } from '@/api/schemas';
import type { ReaderPalette } from '@/theme/reader-themes';
import { useReaderTheme } from './ReaderThemeContext';
import { spineToPosition } from './lib/position';

/** Derive the libraryFileId a `page:file:<id>` readableKey addresses. */
function fileIdOf(readableKey: string): number {
  const parsed = parseReadableKey(readableKey);
  return parsed.kind === 'page' ? parsed.fileId : -1;
}

/**
 * Join an OPF directory with an OPF-relative spine href into the zip entry name
 * the EPUB resource route serves. Mirrors the server contract used by the web
 * reader (`/api/reader/epub/<id>/resource?path=<opfDir/href>`).
 */
function entryPath(opfDir: string | undefined, href: string): string {
  return opfDir ? `${opfDir}/${href}` : href;
}

/**
 * Build the resource URL for a spine item's html.
 *
 * `resourceToken` (the manifest's `epubResourceToken`) is appended as a
 * `?token=` query param IN ADDITION to the Authorization header carried by
 * `source.headers`. The header authenticates the main document, but
 * `react-native-webview` does NOT forward it to the sub-resource requests
 * (linked CSS, <img>, fonts) the rendered HTML triggers — those would 401 and
 * the EPUB would render unstyled. The injected JS (see `buildInjectedJs`)
 * propagates this token to every same-origin sub-resource.
 *
 * IMPORTANT: this is the SHORT-LIVED, `{fileId,userId}`-scoped token from the
 * manifest — NOT the long-lived account bearer. We never put the account bearer
 * in a URL (it leaks into logs / caches / history). When the manifest omits the
 * token (older server), no `?token=` is added; the main doc still loads via the
 * header, and sub-resources may render unstyled (acceptable degradation).
 */
function resourceUrl(
  serverUrl: string,
  fileId: number,
  opfDir: string | undefined,
  href: string,
  resourceToken: string,
): string {
  const entry = entryPath(opfDir, href);
  const base = `${serverUrl}/api/reader/epub/${fileId}/resource?path=${encodeURIComponent(entry)}`;
  return resourceToken ? `${base}&token=${encodeURIComponent(resourceToken)}` : base;
}

/**
 * A message posted from the WebView back to RN: either the measured page count
 * for the current spine item, or a tap-zone navigation request.
 */
type WebViewMsg =
  | { type: 'pageCount'; count: number }
  | { type: 'tap'; action: 'prev' | 'next' | 'toggle' };

/**
 * Build the `injectedJavaScript` that paginates the spine item and reports back.
 *
 * RN's WebView is a separate document with no access to the RN reader palette,
 * so — exactly like the web `EpubIframe` fix — we inject the resolved palette
 * colors as LITERALS into a `<style>`, set up CSS multi-column pagination (or a
 * scroll fallback), measure the page count, wire tap zones, and `postMessage`
 * page count + taps back. Re-injecting (via the `injectJavaScript` ref) on a
 * theme/font change re-applies the literals.
 *
 * It also rewrites same-origin sub-resource URLs (`<link href>`, `<img src>`) to
 * carry `?token=<scoped-token>` so they authenticate — the WebView does not
 * forward the Authorization header to sub-resource requests. The token is the
 * short-lived, `{fileId,userId}`-scoped `epubResourceToken` from the manifest,
 * never the account bearer. A `<meta name="referrer" content="no-referrer">` is
 * injected so the token-bearing URL is not leaked via the Referer header.
 */
function buildInjectedJs(opts: {
  palette: ReaderPalette;
  fontScale: number;
  page: number;
  scrollMode: boolean;
  resourceToken: string;
}): string {
  const { palette, fontScale, page, scrollMode, resourceToken } = opts;
  // Color literals — mirrors the web injection (RN has no CSS vars to cross the
  // document boundary, so the resolved palette is baked in).
  const ink = palette.ink;
  const pageBg = palette.page;
  const accent = palette.accent;
  const fontSize = Math.round(17 * fontScale);
  const gap = 48;

  return `(function(){
    // Sub-resource auth: react-native-webview only attaches the Authorization
    // header to the main document, NOT to linked CSS / <img> / fonts. Those hit
    // the same /resource route, so rewrite every same-origin sub-resource URL to
    // carry the SHORT-LIVED, {fileId,userId}-scoped token as a ?token= query
    // param. This is NOT the account bearer (never put that in a URL). Runs once
    // (guarded by __rdAuth). Also pin a no-referrer policy so the token-bearing
    // URL is not leaked via the Referer header.
    if(!window.__rdAuth){
      window.__rdAuth=true;
      // Suppress Referer so ?token= URLs never leak cross-request.
      try{
        var mr=document.createElement('meta');
        mr.setAttribute('name','referrer');
        mr.setAttribute('content','no-referrer');
        (document.head||document.documentElement).appendChild(mr);
      }catch(e){}
      var tok=${JSON.stringify(resourceToken)};
      if(tok){
        var origin=window.location.origin;
        var withTok=function(url){
          try{
            var u=new URL(url, window.location.href);
            if(u.origin!==origin) return url;
            if(u.searchParams.get('token')!==null) return u.href;
            u.searchParams.set('token', tok);
            return u.href;
          }catch(e){ return url; }
        };
        var rewrite=function(){
          var links=document.querySelectorAll('link[href]');
          for(var i=0;i<links.length;i++){
            var href=links[i].getAttribute('href');
            if(href) links[i].setAttribute('href', withTok(href));
          }
          var imgs=document.querySelectorAll('img[src]');
          for(var j=0;j<imgs.length;j++){
            var src=imgs[j].getAttribute('src');
            if(src) imgs[j].setAttribute('src', withTok(src));
          }
        };
        rewrite();
      }
    }
    var ink=${JSON.stringify(ink)};
    var pageBg=${JSON.stringify(pageBg)};
    var accent=${JSON.stringify(accent)};
    var fontSize=${fontSize};
    var lineH=1.6;
    var gap=${gap};
    var paged=${scrollMode ? 'false' : 'true'};
    var page=${page};
    var s=document.getElementById('rd-inject');
    if(!s){ s=document.createElement('style'); s.id='rd-inject'; document.head.appendChild(s); }
    var vw=window.innerWidth, vh=window.innerHeight;
    var common='html,body{margin:0;}'
      +'body{font-size:'+fontSize+'px;line-height:'+lineH+';color:'+ink+';background:'+pageBg+';box-sizing:border-box;-webkit-text-size-adjust:100%;}'
      +'img,svg,video{max-width:100%;height:auto;}'
      +'a{color:'+accent+';}';
    if(paged){
      s.textContent=common
        +'html,body{height:'+vh+'px;overflow:hidden;}'
        +'body{column-width:'+vw+'px;column-gap:'+gap+'px;column-fill:auto;height:'+vh+'px;padding:24px 24px;transition:transform .3s ease;}';
      void document.body.offsetWidth;
      var step=vw+gap;
      var count=Math.max(1,Math.ceil((document.body.scrollWidth+gap)/step));
      document.body.style.transform='translateX('+(-page*step)+'px)';
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'pageCount',count:count}));
    } else {
      s.textContent=common
        +'html,body{height:auto;}'
        +'body{max-width:680px;margin:0 auto;padding:24px;overflow-x:hidden;}';
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'pageCount',count:1}));
    }
    if(!window.__rdTap){
      window.__rdTap=true;
      document.addEventListener('click',function(e){
        var w=window.innerWidth; if(w<=0) return;
        var rel=e.clientX/w;
        var action=rel<0.3?'prev':(rel>0.7?'next':'toggle');
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'tap',action:action}));
      });
    }
    true;
  })();`;
}

export interface EpubWebViewProps {
  manifest: ReaderManifest;
  /** Toggle the reader chrome (taps in the middle zone). */
  onToggleChrome: () => void;
  /** Scroll-mode fallback (vertical scroll instead of paged columns). */
  scrollMode: boolean;
  /** Font scale, mirrors the SettingsSheet text option (0.8..1.6). */
  fontScale: number;
  /** Reports the spine index currently rendered (for TOC / progress labels). */
  onSpineChange?: (idx: number) => void;
  /**
   * A TOC jump request from the parent. When this changes to a non-null index,
   * the WebView loads that spine item (resetting to its first page). The parent
   * may reset it to `null` after; the WebView only reacts to changes in value,
   * so re-sending the same index requires a null in between.
   */
  requestedSpineIdx?: number | null;
}

/**
 * Renders one EPUB spine item in a `react-native-webview`, paginated with CSS
 * multi-column via `injectedJavaScript`. The palette colors are injected as
 * literals (RN has no CSS vars), and re-injected via `injectJavaScript` when the
 * theme / font / scroll-mode changes. `onMessage` updates the page count + the
 * current page and commits progress (`{ spineIdx, pageInItem }` locator mapped
 * through `spineToPosition`). Page-boundary turns advance/retreat the spine.
 *
 * Native rendering + the injected pagination are device/CI-verified; jest mocks
 * the WebView to a View that surfaces `source` / `injectedJavaScript` / props.
 */
export function EpubWebView({
  manifest,
  onToggleChrome,
  scrollMode,
  fontScale,
  onSpineChange,
  requestedSpineIdx,
}: EpubWebViewProps) {
  const { palette } = useReaderTheme();
  const { state } = useAuth();
  // The account bearer authenticates the MAIN document via the Authorization
  // header only — it is never placed in a URL.
  const token = state.status === 'authenticated' ? state.creds.token : '';
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  // The short-lived, {fileId,userId}-scoped token for sub-resource ?token= auth.
  // Absent from older servers; we degrade gracefully (no ?token=).
  const resourceToken = manifest.epubResourceToken ?? '';

  const fileId = useMemo(() => fileIdOf(manifest.readableKey), [manifest.readableKey]);
  const spine: SpineItem[] = useMemo(() => manifest.spine ?? [], [manifest.spine]);
  const spineCount = Math.max(1, spine.length);

  const { progress, commit } = useReadingProgress(
    manifest.readableKey,
    {
      seriesId: manifest.seriesId,
      volumeId: manifest.volumeId ?? null,
      contentType: manifest.contentType,
    },
    manifest.progress,
  );

  // Seed the spine index + page-in-item from the resume locator.
  const seedSpineIdx = (() => {
    const loc = progress?.locator;
    if (loc && 'spineIdx' in loc) {
      return Math.min(Math.max(0, loc.spineIdx), spineCount - 1);
    }
    return 0;
  })();
  const seedPage = (() => {
    const loc = progress?.locator;
    return loc && 'pageInItem' in loc ? Math.max(0, loc.pageInItem) : 0;
  })();

  const [spineIdx, setSpineIdx] = useState(seedSpineIdx);
  const [page, setPage] = useState(seedPage);
  const [pageCount, setPageCount] = useState(1);

  const webRef = useRef<WebView>(null);

  const current = spine[spineIdx];
  const href = current?.href ?? '';

  const source = useMemo(
    () => ({
      uri: resourceUrl(serverUrl, fileId, manifest.opfDir, href, resourceToken),
      headers: { Authorization: `Bearer ${token}` },
    }),
    [serverUrl, fileId, manifest.opfDir, href, token, resourceToken],
  );

  const injectedJavaScript = useMemo(
    () => buildInjectedJs({ palette, fontScale, page, scrollMode, resourceToken }),
    [palette, fontScale, page, scrollMode, resourceToken],
  );

  // Track whether the current document has finished loading so the re-theme
  // effect only injects against a live WebView. Reset whenever the source URI
  // changes (a new spine item reloads the document).
  const loadedRef = useRef(false);
  // Read `page` through a ref inside the re-theme effect so a theme/font change
  // re-injects with the CURRENT page WITHOUT the effect re-firing on every page
  // turn (which would reset the visible column to whatever stale value closed
  // over). Page turns already re-inject via the `injectedJavaScript` prop change.
  const pageRef = useRef(page);
  pageRef.current = page;

  // Re-inject the literal-palette style on a theme/font/scroll-mode change so a
  // setting switch re-applies immediately (the source itself doesn't reload).
  const reinject = useCallback(() => {
    webRef.current?.injectJavaScript(
      buildInjectedJs({ palette, fontScale, page: pageRef.current, scrollMode, resourceToken }),
    );
  }, [palette, fontScale, scrollMode, resourceToken]);

  // onLoadEnd handler: mark loaded, then run the initial injection.
  const onLoadEnd = useCallback(() => {
    loadedRef.current = true;
    reinject();
  }, [reinject]);

  // A theme / font / scroll-mode switch recolors the live EPUB surface without
  // waiting for a reload. Guarded on `loadedRef` so we never inject into a
  // not-yet-loaded document. `page` is intentionally read via `pageRef` (see
  // above) so this does not re-fire on page turns.
  useEffect(() => {
    if (loadedRef.current) reinject();
  }, [palette, fontScale, scrollMode, reinject]);

  const commitAt = useCallback(
    (sIdx: number, pInItem: number, count: number) => {
      const pos = spineToPosition(sIdx, pInItem, count, spineCount);
      commit(pos, { spineIdx: sIdx, pageInItem: pInItem });
    },
    [commit, spineCount],
  );

  const goPage = useCallback(
    (next: number) => {
      if (next < 0) {
        // Page back past the start → previous spine item (land on its last page,
        // resolved once its page count arrives).
        if (spineIdx > 0) {
          const prev = spineIdx - 1;
          setSpineIdx(prev);
          setPage(0);
          onSpineChange?.(prev);
          commitAt(prev, 0, 1);
        }
        return;
      }
      if (next >= pageCount) {
        // Page forward past the end → next spine item.
        if (spineIdx < spineCount - 1) {
          const nxt = spineIdx + 1;
          setSpineIdx(nxt);
          setPage(0);
          onSpineChange?.(nxt);
          commitAt(nxt, 0, 1);
        }
        return;
      }
      setPage(next);
      commitAt(spineIdx, next, pageCount);
    },
    [spineIdx, spineCount, pageCount, commitAt, onSpineChange],
  );

  // A new spine item reloads the document, so the loaded flag must reset until
  // the next onLoadEnd. Keyed on the resource href that drives `source.uri`.
  useEffect(() => {
    loadedRef.current = false;
  }, [href]);

  // React to a parent TOC jump: load the requested spine item, reset to its
  // first page, report the change, and commit progress. Only acts on an
  // in-range index that differs from the current one (so re-rendering with the
  // same value is a no-op). Deliberately keyed on `requestedSpineIdx` alone so a
  // new jump request is what fires it — the current `spineIdx`/`commitAt` are
  // read through refs to avoid re-running on every page turn / commit identity
  // change.
  const jumpRef = useRef({ spineIdx, commitAt, onSpineChange });
  jumpRef.current = { spineIdx, commitAt, onSpineChange };
  useEffect(() => {
    if (requestedSpineIdx == null) return;
    const target = Math.min(Math.max(0, requestedSpineIdx), spineCount - 1);
    const { spineIdx: curIdx, commitAt: commitNow, onSpineChange: report } = jumpRef.current;
    if (target === curIdx) return;
    setSpineIdx(target);
    setPage(0);
    report?.(target);
    commitNow(target, 0, 1);
  }, [requestedSpineIdx, spineCount]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: WebViewMsg;
      try {
        msg = JSON.parse(e.nativeEvent.data) as WebViewMsg;
      } catch {
        return;
      }
      if (msg.type === 'pageCount') {
        setPageCount(Math.max(1, msg.count));
      } else if (msg.type === 'tap') {
        if (msg.action === 'next') goPage(page + 1);
        else if (msg.action === 'prev') goPage(page - 1);
        else onToggleChrome();
      }
    },
    [goPage, page, onToggleChrome],
  );

  return (
    <View testID="reader-epub" style={{ flex: 1, backgroundColor: palette.page }}>
      <WebView
        ref={webRef}
        source={source}
        injectedJavaScript={injectedJavaScript}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        scrollEnabled={scrollMode}
        style={{ flex: 1, backgroundColor: palette.page }}
      />
    </View>
  );
}
