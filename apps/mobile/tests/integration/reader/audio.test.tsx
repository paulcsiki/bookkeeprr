import { render, screen, fireEvent, act, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrackPlayer from 'react-native-track-player';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ReaderThemeProvider } from '@/features/reader/ReaderThemeContext';
import type { ReaderManifest } from '@/api/schemas';

// Drive the auth context with a fixed bearer token + server URL so the audio
// track URIs and Authorization header are deterministic.
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
import { AudioReader } from '@/features/reader/AudioReader';
import { buildQueue } from '@/features/reader/lib/track-player-setup';

// Capture the commits the reader makes so we can assert progress writes without
// a network round-trip.
const commit = jest.fn();
const mockUseReadingProgress = jest.fn();
jest.mock('@/api/hooks/useReadingProgress', () => ({
  useReadingProgress: (...args: unknown[]) => mockUseReadingProgress(...args),
}));

const manifest: ReaderManifest = {
  readableKey: 'audio:vol:5',
  contentType: 'audiobook',
  reader: 'audio',
  format: 'audio',
  title: 'The Hobbit',
  author: 'J. R. R. Tolkien',
  seriesId: 1,
  volumeId: 5,
  volumeLabel: 'Vol. 1',
  tracks: [
    { idx: 0, fileId: 9, durationSec: 1800, title: 'Chapter 1' },
    { idx: 1, fileId: 10, durationSec: 1200, title: 'Chapter 2' },
  ],
  totalSec: 3000,
  progress: {
    readableKey: 'audio:vol:5',
    position: 0,
    locator: { sec: 0 },
    finished: false,
    restartedFromFinish: false,
  },
};

async function renderReader(onBack = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ReaderThemeProvider initialThemeKey="dark">
            <AudioReader manifest={manifest} onBack={onBack} />
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

/** Drive the mocked native player's reported state (see tests/setup.ts). */
function setPlaybackState(state: string | undefined) {
  (globalThis as { __rntpState?: string | undefined }).__rntpState = state;
}

beforeEach(() => {
  commit.mockClear();
  mockUseReadingProgress.mockReset();
  mockUseReadingProgress.mockReturnValue({ progress: manifest.progress, commit });
  (TrackPlayer.play as jest.Mock).mockClear();
  (TrackPlayer.pause as jest.Mock).mockClear();
  setPlaybackState(undefined);
});

afterEach(() => {
  setPlaybackState(undefined);
});

describe('buildQueue (pure)', () => {
  it('builds one bearer-authed track per manifest track', () => {
    const queue = buildQueue(manifest, 'https://srv.example', 'tok-123');
    expect(queue).toHaveLength(2);
    expect(queue[0]?.url).toBe('https://srv.example/api/reader/audio/9');
    expect(queue[1]?.url).toBe('https://srv.example/api/reader/audio/10');
    expect(queue[0]?.headers?.Authorization).toBe('Bearer tok-123');
    expect(queue[1]?.headers?.Authorization).toBe('Bearer tok-123');
    expect(queue[0]?.title).toBe('Chapter 1');
    expect(queue[0]?.duration).toBe(1800);
  });

  it('uses local file:// urls (no bearer) for offline-downloaded tracks', () => {
    // offlinePaths are now RELATIVE to DocumentDir (the mock is '/mock/Documents').
    // resolveOffline() converts them to absolute before toFileUri().
    const queue = buildQueue(manifest, 'https://srv.example', 'tok-123', [
      'reader/audio_vol_5/track-0',
      'reader/audio_vol_5/track-1',
    ]);
    expect(queue[0]?.url).toBe('file:///mock/Documents/reader/audio_vol_5/track-0');
    expect(queue[1]?.url).toBe('file:///mock/Documents/reader/audio_vol_5/track-1');
    expect(queue[0]?.headers).toBeUndefined();
    expect(queue[1]?.headers).toBeUndefined();
  });
});

describe('AudioReader', () => {
  it('renders the audio reader root with chrome', async () => {
    await renderReader();
    await flushAuth();
    expect(screen.getByTestId('reader-audio')).toBeTruthy();
    expect(screen.getByTestId('reader-back')).toBeTruthy();
  });

  it('renders a play/pause control', async () => {
    await renderReader();
    await flushAuth();
    expect(screen.getByTestId('reader-audio-playpause')).toBeTruthy();
  });

  it('lists the track titles as chapters in the TOC', async () => {
    await renderReader();
    await flushAuth();
    await fireEvent.press(screen.getByTestId('reader-toc-btn'));
    expect(within(screen.getByTestId('reader-toc-item-0')).getByText('Chapter 1')).toBeTruthy();
    expect(within(screen.getByTestId('reader-toc-item-1')).getByText('Chapter 2')).toBeTruthy();
  });

  it('labels the settings button "Playback" (not the text-display "Display")', async () => {
    await renderReader();
    await flushAuth();
    // Audiobooks open a playback sheet (speed / sleep), so the settings button
    // uses the playback affordance, not the text-display "Aa"/"Display" one.
    expect(screen.getByLabelText('Playback')).toBeTruthy();
    expect(screen.queryByLabelText('Display')).toBeNull();
  });

  it('calls TrackPlayer.play when the play control is pressed (player paused)', async () => {
    await renderReader();
    await flushAuth();
    await fireEvent.press(screen.getByTestId('reader-audio-playpause'));
    expect(TrackPlayer.play).toHaveBeenCalled();
    expect(TrackPlayer.pause).not.toHaveBeenCalled();
  });

  it('calls TrackPlayer.pause when the player reports Playing (lock-screen sync)', async () => {
    // The native player (including the lock screen) drives the state; the UI
    // must follow it rather than a stale local boolean.
    setPlaybackState('playing');
    await renderReader();
    await flushAuth();
    // The control reflects the native state — its label is "Pause".
    expect(screen.getByLabelText('Pause')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('reader-audio-playpause'));
    expect(TrackPlayer.pause).toHaveBeenCalled();
    expect(TrackPlayer.play).not.toHaveBeenCalled();
  });

  it('renders the back affordance and forwards onBack', async () => {
    const { onBack } = await renderReader();
    await flushAuth();
    await fireEvent.press(screen.getByTestId('reader-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
