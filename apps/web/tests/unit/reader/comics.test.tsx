// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type PropsWithChildren } from 'react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { ComicsReader } from '@/components/reader/ComicsReader';

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}));

function comicsManifest(): ReaderManifest {
  return {
    readableKey: 'page:file:42',
    contentType: 'comic',
    reader: 'comics',
    format: 'cbz',
    title: 'Test Comic',
    author: 'A. Penciller',
    seriesId: 7,
    volumeId: 3,
    pageCount: 14,
    progress: {
      readableKey: 'page:file:42',
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

function srcs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src') ?? '');
}

describe('ComicsReader', () => {
  it('renders the current page image from the page API', () => {
    const { container } = render(
      <Wrapper>
        <ComicsReader manifest={comicsManifest()} />
      </Wrapper>,
    );
    expect(srcs(container).some((s) => s.includes('/api/reader/comics/42/page/0'))).toBe(true);
  });

  it('ArrowRight advances to the next page (LTR)', () => {
    const { container } = render(
      <Wrapper>
        <ComicsReader manifest={comicsManifest()} initialDir="ltr" initialSpread="single" />
      </Wrapper>,
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(srcs(container).some((s) => s.includes('/api/reader/comics/42/page/1'))).toBe(true);
  });

  it('shows a page label in the rail', () => {
    render(
      <Wrapper>
        <ComicsReader manifest={comicsManifest()} />
      </Wrapper>,
    );
    expect(screen.getByText(/Page 1 \/ 14/)).toBeTruthy();
  });
});
