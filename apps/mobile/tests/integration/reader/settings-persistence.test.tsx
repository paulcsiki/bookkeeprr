import { Pressable, Text } from 'react-native';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer from 'react-native-track-player';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ReaderThemeProvider, useReaderTheme } from '@/features/reader/ReaderThemeContext';
import {
  loadReaderSettings,
  flushReaderSettings,
} from '@/features/reader/lib/reader-settings';
import type { ReaderManifest } from '@/api/schemas';

// Drive the auth context with a fixed bearer token + server URL (see
// text.test.tsx / audio.test.tsx for the same harness).
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
import { AudioReader } from '@/features/reader/AudioReader';

const mockCommit = jest.fn();
jest.mock('@/api/hooks/useReadingProgress', () => ({
  useReadingProgress: () => ({ progress: undefined, commit: mockCommit }),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(async () => {
  await flushReaderSettings();
});

/** Wait one microtask tick so async hydration (storage + auth) settles. */
async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// ReaderThemeProvider hydration + setter persistence
// ---------------------------------------------------------------------------

/** Exposes the theme state + setters as pressables for the tests. */
function Probe() {
  const t = useReaderTheme();
  return (
    <>
      <Text testID="probe-themekey">{t.themeKey}</Text>
      <Text testID="probe-auto">{String(t.auto)}</Text>
      <Text testID="probe-brightness">{String(t.brightness)}</Text>
      <Text testID="probe-warmth">{String(t.warmth)}</Text>
      <Pressable testID="probe-pick-dark" onPress={() => t.setThemeKey('dark')} />
      <Pressable testID="probe-dim" onPress={() => t.setBrightness(0.4)} />
      <Pressable testID="probe-warm" onPress={() => t.setWarmth(0.6)} />
      <Pressable testID="probe-auto-on" onPress={() => t.setAuto(true)} />
    </>
  );
}

async function renderThemeProbe() {
  await render(
    <ThemeProvider>
      <ReaderThemeProvider kind="text" initialThemeKey="paper">
        <Probe />
      </ReaderThemeProvider>
    </ThemeProvider>,
  );
  await flushAsync();
}

describe('ReaderThemeProvider persistence', () => {
  it('keeps the content-type seed when nothing is persisted', async () => {
    await renderThemeProbe();
    expect(screen.getByTestId('probe-themekey').props.children).toBe('paper');
    expect(screen.getByTestId('probe-brightness').props.children).toBe('1');
  });

  it('hydrates a persisted bundle over the seed', async () => {
    await AsyncStorage.setItem(
      'bookkeeprr-reader-settings:text',
      JSON.stringify({ themeKey: 'sepia', brightness: 0.8, warmth: 0.2, auto: false }),
    );
    await renderThemeProbe();
    expect(screen.getByTestId('probe-themekey').props.children).toBe('sepia');
    expect(screen.getByTestId('probe-brightness').props.children).toBe('0.8');
    expect(screen.getByTestId('probe-warmth').props.children).toBe('0.2');
  });

  it('persists themeKey (and auto=false) on an explicit pick', async () => {
    const setSpy = jest.spyOn(AsyncStorage, 'setItem');
    await renderThemeProbe();
    await fireEvent.press(screen.getByTestId('probe-pick-dark'));
    await act(() => flushReaderSettings());
    expect(setSpy).toHaveBeenCalledWith(
      'bookkeeprr-reader-settings:text',
      JSON.stringify({ themeKey: 'dark', auto: false }),
    );
    setSpy.mockRestore();
  });

  it('persists brightness / warmth / auto without touching themeKey', async () => {
    await renderThemeProbe();
    await fireEvent.press(screen.getByTestId('probe-dim'));
    await fireEvent.press(screen.getByTestId('probe-warm'));
    await fireEvent.press(screen.getByTestId('probe-auto-on'));
    await act(() => flushReaderSettings());
    // No themeKey in the bundle — the seed keeps working until the user picks.
    expect(await loadReaderSettings('text')).toEqual({
      auto: true,
      brightness: 0.4,
      warmth: 0.6,
    });
  });

  it('does not persist anything when `kind` is omitted (test mounts)', async () => {
    const setSpy = jest.spyOn(AsyncStorage, 'setItem');
    await render(
      <ThemeProvider>
        <ReaderThemeProvider initialThemeKey="paper">
          <Probe />
        </ReaderThemeProvider>
      </ThemeProvider>,
    );
    await flushAsync();
    await fireEvent.press(screen.getByTestId('probe-pick-dark'));
    await act(() => flushReaderSettings());
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TextReader fontScale hydration + persistence
// ---------------------------------------------------------------------------

const epubManifest: ReaderManifest = {
  readableKey: 'page:file:7',
  contentType: 'ebook',
  reader: 'text',
  format: 'epub',
  title: 'Dune',
  seriesId: 1,
  volumeId: 3,
  opfDir: 'OEBPS',
  spine: [{ idx: 0, href: 'ch1.xhtml' }],
  progress: {
    readableKey: 'page:file:7',
    position: 0,
    locator: { spineIdx: 0, pageInItem: 0 },
    finished: false,
    restartedFromFinish: false,
  },
};

async function renderTextReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ReaderThemeProvider initialThemeKey="paper">
            <TextReader manifest={epubManifest} onBack={jest.fn()} />
          </ReaderThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await flushAsync();
}

describe('TextReader fontScale persistence', () => {
  it('hydrates the persisted font scale into the WebView injection', async () => {
    await AsyncStorage.setItem(
      'bookkeeprr-reader-settings:text',
      JSON.stringify({ fontScale: 1.4 }),
    );
    await renderTextReader();
    const js = screen.getByTestId('webview').props.injectedJavaScript as string;
    // Math.round(17 * 1.4) = 24
    expect(js).toContain('var fontSize=24;');
  });

  it('defaults to scale 1 when nothing is persisted', async () => {
    await renderTextReader();
    const js = screen.getByTestId('webview').props.injectedJavaScript as string;
    expect(js).toContain('var fontSize=17;');
  });
});

// ---------------------------------------------------------------------------
// AudioReader rate hydration + persistence
// ---------------------------------------------------------------------------

const audioManifest: ReaderManifest = {
  readableKey: 'audio:vol:5',
  contentType: 'audiobook',
  reader: 'audio',
  format: 'audio',
  title: 'The Hobbit',
  seriesId: 1,
  volumeId: 5,
  tracks: [{ idx: 0, fileId: 9, durationSec: 1800, title: 'Chapter 1' }],
  totalSec: 1800,
  progress: {
    readableKey: 'audio:vol:5',
    position: 0,
    locator: { sec: 0 },
    finished: false,
    restartedFromFinish: false,
  },
};

async function renderAudioReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ReaderThemeProvider initialThemeKey="dark">
            <AudioReader manifest={audioManifest} onBack={jest.fn()} />
          </ReaderThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await flushAsync();
}

describe('AudioReader rate persistence', () => {
  beforeEach(() => {
    (TrackPlayer.setRate as jest.Mock).mockClear();
  });

  it('hydrates the persisted rate and applies it to the native player', async () => {
    await AsyncStorage.setItem('bookkeeprr-reader-settings:audio', JSON.stringify({ rate: 1.5 }));
    await renderAudioReader();
    expect(TrackPlayer.setRate).toHaveBeenCalledWith(1.5);
    // The playback sheet shows the hydrated rate.
    await fireEvent.press(screen.getByTestId('reader-settings-btn'));
    expect(screen.getByText('1.50×')).toBeTruthy();
  });

  it('persists each rate cycle', async () => {
    await renderAudioReader();
    await fireEvent.press(screen.getByTestId('reader-settings-btn'));
    // 1 → 1.25
    await fireEvent.press(screen.getByTestId('reader-audio-speed'));
    await act(() => flushReaderSettings());
    expect(await loadReaderSettings('audio')).toEqual({ rate: 1.25 });
    // 1.25 → 1.5
    await fireEvent.press(screen.getByTestId('reader-audio-speed'));
    await act(() => flushReaderSettings());
    expect(await loadReaderSettings('audio')).toEqual({ rate: 1.5 });
  });
});
