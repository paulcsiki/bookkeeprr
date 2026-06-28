// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type PropsWithChildren } from 'react';
import type { ReaderManifest } from '@bookkeeprr/types';
import type { UseQueryResult } from '@tanstack/react-query';

// Mock the manifest hook so we can drive the shell through each state.
const useManifestMock = vi.fn();
vi.mock('@/components/reader/hooks/useManifest', () => ({
  useManifest: (...args: unknown[]) => useManifestMock(...args),
}));

// The shell calls useRouter() to wire the in-reader back button; stub it so
// there's no AppRouter context requirement in jsdom.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { Reader } from '@/components/reader/Reader';

function comicsManifest(): ReaderManifest {
  return {
    readableKey: 'page:file:42',
    contentType: 'comic',
    reader: 'comics',
    format: 'cbz',
    title: 'Test Comic',
    author: 'A. Penciller',
    seriesId: 1,
    volumeId: 7,
    pageCount: 24,
    progress: {
      readableKey: 'page:file:42',
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
    },
  };
}

/** Build a minimal UseQueryResult-shaped object for the mock. */
function queryState(
  over: Partial<UseQueryResult<ReaderManifest, Error>>,
): UseQueryResult<ReaderManifest, Error> {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    isPending: false,
    status: 'pending',
    ...over,
  } as UseQueryResult<ReaderManifest, Error>;
}

function Wrapper({ children }: PropsWithChildren): React.JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('Reader shell', () => {
  beforeEach(() => {
    cleanup();
    useManifestMock.mockReset();
  });

  it('shows a loading indicator while the manifest loads', () => {
    useManifestMock.mockReturnValue(
      queryState({ isLoading: true, isPending: true, status: 'pending' }),
    );
    render(
      <Wrapper>
        <Reader fileId={42} />
      </Wrapper>,
    );
    expect(screen.getByTestId('reader-loading')).toBeTruthy();
  });

  it('shows a friendly error with a back-to-library link on failure', () => {
    useManifestMock.mockReturnValue(
      queryState({ isError: true, error: new Error('HTTP 404'), status: 'error' }),
    );
    render(
      <Wrapper>
        <Reader fileId={42} />
      </Wrapper>,
    );
    expect(screen.getByText(/couldn.t open this title/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /library/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/library');
  });

  it('dispatches to the comics reader on a comics manifest', () => {
    useManifestMock.mockReturnValue(
      queryState({
        data: comicsManifest(),
        isSuccess: true,
        status: 'success',
      }),
    );
    render(
      <Wrapper>
        <Reader fileId={42} />
      </Wrapper>,
    );
    expect(screen.getByTestId('reader-comics')).toBeTruthy();
  });
});
