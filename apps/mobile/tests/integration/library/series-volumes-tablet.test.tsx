import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SeriesVolumes from '@/screens/library/SeriesVolumes';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 1180, height: 820 }),
}));
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
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: { seriesId: '1' } }),
  };
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesVolumes />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoBack.mockClear();
});

it('renders the split layout on tablet landscape', async () => {
  await renderScreen();
  await waitFor(() => expect(screen.getByTestId('volumes-split')).toBeTruthy());
  expect(screen.getByTestId('volumes-split-left')).toBeTruthy();
  expect(screen.getByTestId('volumes-split-right')).toBeTruthy();
});

it('has a back button in landscape that goes back', async () => {
  await renderScreen();
  await waitFor(() => expect(screen.getByTestId('volumes-split')).toBeTruthy());

  await fireEvent.press(screen.getByTestId('btn-back-volumes'));
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('keeps tap-to-read on the right-pane volume rows', async () => {
  await renderScreen();
  await waitFor(() => expect(screen.getByTestId('vol-1')).toBeTruthy());

  // Series 1 (Vinland Saga, manga) vol 1 → libraryFileId 1000.
  await fireEvent.press(screen.getByTestId('vol-1'));
  expect(mockNavigate).toHaveBeenCalledWith('Reader', { fileId: '1000' });
});
