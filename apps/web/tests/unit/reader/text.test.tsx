// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type PropsWithChildren } from 'react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { TextReader } from '@/components/reader/TextReader';

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}));

// pdf.js cannot run its worker / canvas under jsdom — mock the module so
// PdfSurface mounts and exercises its lifecycle without a real document.
const fakeRender = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
const fakeGetPage = vi.fn(async () => ({
  getViewport: () => ({ width: 600, height: 800 }),
  render: fakeRender,
}));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({ numPages: 2, getPage: fakeGetPage }),
  })),
}));

function epubManifest(): ReaderManifest {
  return {
    readableKey: 'page:file:7',
    contentType: 'ebook',
    reader: 'text',
    format: 'epub',
    title: 'An EPUB',
    author: 'A. Writer',
    seriesId: 1,
    volumeId: null,
    opfDir: 'OEBPS',
    spine: [
      { idx: 0, href: 'ch1.xhtml' },
      { idx: 1, href: 'ch2.xhtml' },
    ],
    toc: [],
    progress: {
      readableKey: 'page:file:7',
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
    },
  };
}

function pdfManifest(): ReaderManifest {
  return {
    readableKey: 'page:file:9',
    contentType: 'ebook',
    reader: 'text',
    format: 'pdf',
    title: 'A PDF',
    author: null,
    seriesId: 2,
    volumeId: null,
    pageCount: 2,
    progress: {
      readableKey: 'page:file:9',
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
    },
  };
}

function Wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TextReader (epub)', () => {
  it('renders an iframe pointing at the epub resource route for the current spine item', () => {
    const { container } = render(
      <Wrapper>
        <TextReader manifest={epubManifest()} />
      </Wrapper>,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    const src = iframe?.getAttribute('src') ?? '';
    expect(src).toContain('/api/reader/epub/7/resource?path=');
    expect(decodeURIComponent(src)).toContain('OEBPS/ch1.xhtml');
  });

  it('sandboxes the iframe without allow-scripts', () => {
    const { container } = render(
      <Wrapper>
        <TextReader manifest={epubManifest()} />
      </Wrapper>,
    );
    const sandbox = container.querySelector('iframe')?.getAttribute('sandbox') ?? '';
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-scripts');
  });
});

describe('TextReader (pdf)', () => {
  it('mounts a canvas surface for a pdf manifest', async () => {
    const { container } = render(
      <Wrapper>
        <TextReader manifest={pdfManifest()} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(container.querySelector('canvas')).toBeTruthy();
    });
  });
});
