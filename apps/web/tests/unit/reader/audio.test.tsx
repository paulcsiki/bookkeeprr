// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type PropsWithChildren } from 'react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { AudioReader } from '@/components/reader/AudioReader';

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}));

function audioManifest(): ReaderManifest {
  return {
    readableKey: 'audio:vol:5',
    contentType: 'audio',
    reader: 'audio',
    format: 'audio',
    title: 'Test Audiobook',
    author: 'A. Narrator',
    seriesId: 7,
    volumeId: 5,
    tracks: [{ idx: 0, fileId: 9, durationSec: 600, title: 'Ch1' }],
    chapters: [
      { title: 'Chapter One', startSec: 0 },
      { title: 'Chapter Two', startSec: 300 },
    ],
    totalSec: 600,
    progress: {
      readableKey: 'audio:vol:5',
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

describe('AudioReader', () => {
  beforeAll(() => {
    // jsdom does not implement media playback.
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('renders an <audio> element pointed at the audio API', () => {
    const { container } = render(
      <Wrapper>
        <AudioReader manifest={audioManifest()} />
      </Wrapper>,
    );
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    expect(audio?.getAttribute('src') ?? '').toContain('/api/reader/audio/9');
  });

  it('the play button toggles to pause on click', () => {
    render(
      <Wrapper>
        <AudioReader manifest={audioManifest()} />
      </Wrapper>,
    );
    const playBtn = screen.getByLabelText('Play');
    fireEvent.click(playBtn);
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('renders the chapter list with chapter titles', () => {
    render(
      <Wrapper>
        <AudioReader manifest={audioManifest()} />
      </Wrapper>,
    );
    // "Chapter One" also appears in the top-bar subtitle (current chapter),
    // so it can match more than once; "Chapter Two" is list-only.
    expect(screen.getAllByText('Chapter One').length).toBeGreaterThan(0);
    expect(screen.getByText('Chapter Two')).toBeTruthy();
  });
});
