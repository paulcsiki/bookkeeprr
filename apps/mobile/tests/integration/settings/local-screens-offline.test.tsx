import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { useConnectivity } from '@/state/connectivityStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
  };
});

// The Downloads screen now renders per-series groups that read the session
// (useAuth) + may enumerate volumes (useSeries) for "download rest of series".
// Provide a stable token + the query client so the screen mounts; useSeries is
// gated `enabled` on a numeric seriesId, so it never fires for these fixtures.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv', token: 't', refreshToken: 'r',
      expiresAt: '2099-01-01T00:00:00Z', certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

// Downloads: a ready disk scan (so the footer/section renders) + the AsyncStorage settings.
const mockSetWifi = jest.fn();
const mockSetAuto = jest.fn();
jest.mock('@/features/reader/lib/useOfflineDownloads', () => ({
  useOfflineDownloads: () => ({
    items: [
      {
        readableKey: 'page_file_1',
        readableKeys: ['page_file_1'],
        volumeCount: 1,
        title: 'Berserk',
        seriesName: 'Berserk',
        contentType: 'manga',
        coverUrl: null,
        hue: 12,
        bytes: 2048,
        lastReadAt: 1,
        downloadedAt: 1,
        resolved: true,
        broken: false,
        volumes: [],
      },
    ],
    isLoading: false,
    totalBytes: 2048,
    byType: {},
    removeMany: jest.fn(),
  }),
}));
jest.mock('@/features/reader/lib/offline-settings', () => ({
  useOfflineSettings: () => ({
    settings: { autoDownloadNext: false, wifiOnly: true },
    setAutoDownloadNext: mockSetAuto,
    setWifiOnly: mockSetWifi,
  }),
}));

import Downloads from '@/screens/settings/Downloads';
import Appearance from '@/screens/settings/Appearance';
import VersionHistory from '@/screens/settings/VersionHistory';

function setOffline(): void {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
}

beforeEach(() => {
  mockSetWifi.mockClear();
  mockSetAuto.mockClear();
});

describe('local settings screens stay usable offline', () => {
  it('offline: Downloads renders fully, no offline state, and the toggles are usable', async () => {
    setOffline();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={qc}>
            <Downloads />
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('toggle-wifi-only')).toBeTruthy());
    // No server offline state on a local screen.
    expect(screen.queryByTestId('settings-offline-state')).toBeNull();
    // The labeled section is present.
    expect(screen.getByText('OFFLINE & DOWNLOADS')).toBeTruthy();
    // Toggles persist offline (call the AsyncStorage-backed setter). The Toggle is a
    // Pressable that flips on tap, so we drive it with press, not valueChange.
    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-wifi-only'));
    });
    expect(mockSetWifi).toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-auto-next'));
    });
    expect(mockSetAuto).toHaveBeenCalled();
  });

  it('offline: Appearance renders fully, no offline state, and the theme controls are interactive', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <Appearance />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('screen-appearance')).toBeTruthy());
    expect(screen.queryByTestId('settings-offline-state')).toBeNull();
    // The ThemeSwitcher swatches/scheme controls respond offline.
    expect(screen.getByTestId('swatch-sakura')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('swatch-sakura'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('swatch-sakura').props.accessibilityState?.selected).toBe(true);
    });
  });

  it('offline: Version history renders fully with no offline state', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <VersionHistory />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('screen-version-history')).toBeTruthy());
    expect(screen.queryByTestId('settings-offline-state')).toBeNull();
    // The bundled changelog (no network) still renders its current release.
    expect(screen.getByText('Current')).toBeTruthy();
  });
});
