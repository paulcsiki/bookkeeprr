import { render, screen, act, fireEvent, cleanup } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ReaderThemeProvider } from '@/features/reader/ReaderThemeContext';
import type { ReaderManifest } from '@/api/schemas';

// Drive the auth context with a fixed bearer token + server URL so the resource
// URIs and Authorization header are deterministic.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv.example',
      token: 'tok-123',
      refreshToken: 'r',
      expiresAt: '2099-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

import { AuthProvider } from '@/auth/AuthContext';
import { TextReader } from '@/features/reader/TextReader';

// Capture the commits the reader makes so we can assert progress writes without
// a network round-trip.
const commit = jest.fn();
const mockUseReadingProgress = jest.fn();
jest.mock('@/api/hooks/useReadingProgress', () => ({
  useReadingProgress: (...args: unknown[]) => mockUseReadingProgress(...args),
}));

const epubManifest: ReaderManifest = {
  readableKey: 'page:file:7',
  contentType: 'ebook',
  reader: 'text',
  format: 'epub',
  title: 'Dune',
  seriesId: 1,
  volumeId: 3,
  volumeLabel: 'Vol. 1',
  opfDir: 'OEBPS',
  epubResourceToken: 'scoped-tok-abc',
  spine: [
    { idx: 0, href: 'ch1.xhtml' },
    { idx: 1, href: 'ch2.xhtml' },
  ],
  toc: [
    { label: 'Chapter One', href: 'ch1.xhtml', spineIdx: 0 },
    { label: 'Chapter Two', href: 'ch2.xhtml', spineIdx: 1 },
  ],
  progress: {
    readableKey: 'page:file:7',
    position: 0,
    locator: { spineIdx: 0, pageInItem: 0 },
    finished: false,
    restartedFromFinish: false,
  },
};

const mobiManifest: ReaderManifest = {
  readableKey: 'page:file:77',
  contentType: 'ebook',
  reader: 'text',
  format: 'mobi',
  title: 'The Time Machine',
  author: 'H. G. Wells',
  seriesId: 9,
  volumeId: 11,
  volumeLabel: 'Vol. 1',
  epubResourceToken: 'scoped-mobi-tok',
  progress: {
    readableKey: 'page:file:77',
    position: 0.3,
    locator: { frac: 0.3 },
    finished: false,
    restartedFromFinish: false,
  },
};

const pdfManifest: ReaderManifest = {
  readableKey: 'page:file:8',
  contentType: 'ebook',
  reader: 'text',
  format: 'pdf',
  title: 'Spec Sheet',
  seriesId: 2,
  volumeId: 4,
  pageCount: 2,
  progress: {
    readableKey: 'page:file:8',
    position: 0,
    locator: { page: 0 },
    finished: false,
    restartedFromFinish: false,
  },
};

async function renderReader(manifest: ReaderManifest, onBack = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ReaderThemeProvider initialThemeKey="paper">
            <TextReader manifest={manifest} onBack={onBack} />
          </ReaderThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  return { ...utils, onBack };
}

/** Wait one microtask tick so AuthProvider settles to authenticated. */
async function flushAuth() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  commit.mockClear();
  mockUseReadingProgress.mockReset();
});

// Explicitly unmount between tests. The MOBI branch hosts a WebView whose
// inline foliate document is a large string; without an explicit cleanup the
// accumulated render trees from the MOBI block confused later `getByTestId`
// lookups (e.g. the pdf branch) in the same file.
afterEach(() => {
  cleanup();
});

describe('epub', () => {
  beforeEach(() => {
    mockUseReadingProgress.mockReturnValue({ progress: epubManifest.progress, commit });
  });

  it('renders a WebView for the current spine item, bearer-authed', async () => {
    await renderReader(epubManifest);
    await flushAuth();

    const webview = screen.getByTestId('webview');
    const source = webview.props.source as { uri: string; headers: Record<string, string> };
    expect(source.uri).toContain('/api/reader/epub/7/resource?path=OEBPS%2Fch1.xhtml');
    expect(source.uri.startsWith('https://srv.example/')).toBe(true);
    // The MAIN document still authenticates via the account bearer header.
    expect(source.headers.Authorization).toBe('Bearer tok-123');
  });

  it('renders inside the text reader root with chrome', async () => {
    await renderReader(epubManifest);
    await flushAuth();
    expect(screen.getByTestId('reader-text')).toBeTruthy();
    expect(screen.getByTestId('reader-back')).toBeTruthy();
  });

  it('appends the manifest SCOPED epubResourceToken (not the account bearer) to the resource URI', async () => {
    await renderReader(epubManifest);
    await flushAuth();
    const webview = screen.getByTestId('webview');
    const source = webview.props.source as { uri: string };
    // The ?token= carries the short-lived scoped token, NOT the account bearer.
    expect(source.uri).toContain('token=scoped-tok-abc');
    expect(source.uri).not.toContain('token=tok-123');
  });

  it('rewrites same-origin sub-resources with the scoped token + no-referrer in injected JS', async () => {
    await renderReader(epubManifest);
    await flushAuth();
    const webview = screen.getByTestId('webview');
    const js = webview.props.injectedJavaScript as string;
    // The injection embeds the SCOPED token (never the account bearer) and
    // rewrites link[href] / img[src], and pins a no-referrer policy.
    expect(js).toContain('"scoped-tok-abc"');
    expect(js).not.toContain('"tok-123"');
    expect(js).toContain("querySelectorAll('link[href]')");
    expect(js).toContain("querySelectorAll('img[src]')");
    expect(js).toContain('no-referrer');
  });

  it('degrades gracefully when the manifest lacks epubResourceToken (older server)', async () => {
    const rest: ReaderManifest = { ...epubManifest };
    delete rest.epubResourceToken;
    await renderReader(rest);
    await flushAuth();
    const webview = screen.getByTestId('webview');
    const source = webview.props.source as { uri: string; headers: Record<string, string> };
    // No ?token= appended, but the main doc still authenticates via the header.
    expect(source.uri).not.toContain('token=');
    expect(source.headers.Authorization).toBe('Bearer tok-123');
  });

  it('TOC jump drives the WebView to load the chosen chapter', async () => {
    await renderReader(epubManifest);
    await flushAuth();

    // Initially on spine 0 (ch1).
    expect((screen.getByTestId('webview').props.source as { uri: string }).uri).toContain(
      'OEBPS%2Fch1.xhtml',
    );

    // Open the TOC and jump to Chapter Two (spineIdx 1).
    await fireEvent.press(screen.getByTestId('reader-toc-btn'));
    await fireEvent.press(screen.getByTestId('reader-toc-item-1'));

    // The WebView now loads ch2 — proving the jump actually navigated, not just
    // updated the parent's label.
    expect((screen.getByTestId('webview').props.source as { uri: string }).uri).toContain(
      'OEBPS%2Fch2.xhtml',
    );
  });
});

describe('mobi (foliate)', () => {
  // The WebView mock records `injectJavaScript` calls here so we can assert the
  // imperative foliate navigation (goToHref) the ref-effect drives.
  const injectLog = (globalThis as unknown as { __webviewInjectLog: string[] }).__webviewInjectLog;
  beforeEach(() => {
    mockUseReadingProgress.mockReturnValue({ progress: mobiManifest.progress, commit });
    injectLog.length = 0;
  });

  it('renders the MOBI branch inside the SHARED text reader chrome', async () => {
    await renderReader(mobiManifest);
    await flushAuth();
    // Same shared shell as epub: the text reader root + the chrome back button.
    expect(screen.getByTestId('reader-text')).toBeTruthy();
    expect(screen.getByTestId('reader-back')).toBeTruthy();
    // The foliate webview host renders.
    expect(screen.getByTestId('reader-mobi')).toBeTruthy();
  });

  it('hosts a WebView with a self-contained foliate HTML document', async () => {
    await renderReader(mobiManifest);
    await flushAuth();
    const webview = screen.getByTestId('webview');
    const source = webview.props.source as { html: string; baseUrl?: string };
    // Inline HTML (not a remote uri) so foliate is bundled + works offline.
    expect(typeof source.html).toBe('string');
    expect(source.html).toContain('foliate-view');
    // The bootstrap targets the ebook download route with the SCOPED token.
    expect(source.html).toContain('/api/reader/ebook/77/download');
    expect(source.html).toContain('scoped-mobi-tok');
    // Resumes from the manifest's { frac } locator (0.3).
    expect(source.html).toContain('0.3');
  });

  it('commits a { frac } locator when the WebView reports a relocate', async () => {
    await renderReader(mobiManifest);
    await flushAuth();
    const webview = screen.getByTestId('webview');
    await act(async () => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'relocate', fraction: 0.55 }) } });
      await Promise.resolve();
    });
    expect(commit).toHaveBeenLastCalledWith(0.55, { frac: 0.55 });
  });

  it('shows the reading percentage in the progress rail seeded from { frac }', async () => {
    await renderReader(mobiManifest);
    await flushAuth();
    // The rail seeds from the resume fraction (0.3 → 30%). Before any relocate
    // reports a foliate location, the left label also falls back to percent, so
    // both rail labels read 30%.
    expect(screen.getAllByText('30%').length).toBeGreaterThan(0);
  });

  it('shows the 1-based "{current+1} / {total}" location readout from a relocate', async () => {
    await renderReader(mobiManifest);
    await flushAuth();
    const webview = screen.getByTestId('webview');
    await act(async () => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'relocate',
            fraction: 0.4,
            location: { current: 4, total: 120 },
          }),
        },
      });
      await Promise.resolve();
    });
    // 0-based current 4 → "5 / 120" (1-based).
    expect(screen.getByText('5 / 120')).toBeTruthy();
  });

  it('shows the TOC button + entries from a bridged toc message and navigates via goToHref', async () => {
    await renderReader(mobiManifest);
    await flushAuth();
    const webview = screen.getByTestId('webview');

    // Before any TOC arrives, the chrome's TOC button has no handler (no-op).
    expect(screen.queryByTestId('reader-overlay-toc')).toBeNull();

    // The bootstrap signals readiness (so the requestedHref effect will fire),
    // then foliate bridges its flattened book.toc once the book opens.
    await act(async () => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'toc',
            entries: [
              { label: 'Foreword', href: 'text/part0000.html', depth: 0 },
              { label: 'Chapter I', href: 'text/part0001.html', depth: 0 },
            ],
          }),
        },
      });
      await Promise.resolve();
    });

    // The TOC button now opens the shared panel populated with the entries.
    await fireEvent.press(screen.getByTestId('reader-toc-btn'));
    expect(screen.getByTestId('reader-toc-panel')).toBeTruthy();
    expect(screen.getByText('Chapter I')).toBeTruthy();

    // Tapping an entry requests a goToHref navigation with that entry's href.
    // The request flows to the MobiWebView as `requestedHref`, whose effect
    // injects a `window.__rdCmd({ kind: 'goToHref', href })` command on the
    // WebView ref (captured by the mock's inject log).
    injectLog.length = 0;
    await act(async () => {
      fireEvent.press(screen.getByTestId('reader-toc-item-1'));
      await Promise.resolve();
    });
    expect(
      injectLog.some((js) => js.includes("kind: 'goToHref'") && js.includes('text/part0001.html')),
    ).toBe(true);
  });

  it('surfaces a readable error state when the WebView reports a load/parse failure', async () => {
    await renderReader(mobiManifest);
    await flushAuth();
    const webview = screen.getByTestId('webview');
    await act(async () => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'error', message: 'download HTTP 404' }) },
      });
      await Promise.resolve();
    });
    // Instead of a blank page, the reader shows the parity error state.
    expect(screen.getByTestId('reader-mobi-error')).toBeTruthy();
  });
});

describe('pdf', () => {
  beforeEach(() => {
    mockUseReadingProgress.mockReturnValue({ progress: pdfManifest.progress, commit });
  });

  it('renders a Pdf view for the bearer-authed pdf serving route', async () => {
    await renderReader(pdfManifest);
    await flushAuth();

    const pdf = screen.getByTestId('pdf-view');
    const source = pdf.props.source as { uri: string; headers: Record<string, string> };
    expect(source.uri).toContain('/api/reader/pdf/8');
    expect(source.uri.startsWith('https://srv.example/')).toBe(true);
    expect(source.headers.Authorization).toBe('Bearer tok-123');
  });

  it('commits the new position on a page change', async () => {
    await renderReader(pdfManifest);
    await flushAuth();

    const pdf = screen.getByTestId('pdf-view');
    act(() => {
      pdf.props.onPageChanged(2, 2);
    });
    // page 2 of 2 → 0-based page 1 → position 1
    expect(commit).toHaveBeenLastCalledWith(1, { page: 1 });
  });
});
