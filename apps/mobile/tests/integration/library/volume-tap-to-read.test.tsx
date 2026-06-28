import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import SeriesVolumes from '@/screens/library/SeriesVolumes';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2999-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockNavigate = jest.fn();
let mockRouteSeriesId = '1';
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useRoute: () => ({ params: { seriesId: mockRouteSeriesId } }),
  };
});

function renderScreen(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>{node}</QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockRouteSeriesId = '1';
});

it('opens a paged volume in the reader by its libraryFileId when tapped', async () => {
  // Series 1 (Vinland Saga, manga) has 22 owned volumes; vol 1 → libraryFileId 1000.
  mockRouteSeriesId = '1';
  renderScreen(<SeriesVolumes />);
  await waitFor(() => expect(screen.getByTestId('vol-1')).toBeTruthy());

  fireEvent.press(screen.getByTestId('vol-1'));
  expect(mockNavigate).toHaveBeenCalledWith('Reader', { fileId: '1000' });
});

it('opens an audiobook volume by volumeId (the audio player keys off the volume)', async () => {
  // Series 6 (Project Hail Mary, audio) has 1 owned volume.
  mockRouteSeriesId = '6';
  renderScreen(<SeriesVolumes />);
  await waitFor(() => expect(screen.getByTestId('vol-1')).toBeTruthy());

  fireEvent.press(screen.getByTestId('vol-1'));
  expect(mockNavigate).toHaveBeenCalledWith('Reader', { volumeId: '1' });
});

it('does not navigate when a missing (unowned) volume is tapped', async () => {
  // Series 1 vol 23 (index 22) is beyond the 22 owned → no library file.
  mockRouteSeriesId = '1';
  renderScreen(<SeriesVolumes />);
  await waitFor(() => expect(screen.getByTestId('vol-23')).toBeTruthy());

  fireEvent.press(screen.getByTestId('vol-23'));
  expect(mockNavigate).not.toHaveBeenCalled();
});
