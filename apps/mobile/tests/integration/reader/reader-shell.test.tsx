import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import type { ReaderManifest } from '@/api/schemas';

// Provide a stable token so ReaderSurface's usePeers (which calls useAuth)
// finds an AuthProvider. DS11d added usePeers to ReaderSurface.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2099-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

// The Reader screen reads route params and calls useReaderManifest. We mock the
// hook module so each case can drive loading / error / success states without a
// network round-trip. (The MSW-backed parse is covered in the hooks test.)
const mockUseReaderManifest = jest.fn();
jest.mock('@/api/hooks/useReaderManifest', () => ({
  useReaderManifest: (...args: unknown[]) => mockUseReaderManifest(...args),
}));

// The shell's job is dispatch, not the comics internals (covered in
// comics.test.tsx). Stub ComicsReader with a lightweight surface carrying the
// contract testIDs so the shell test stays free of the auth/progress wiring the
// real reader needs.
jest.mock('@/features/reader/ComicsReader', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Pressable, Text } = require('react-native');
  return {
    ComicsReader: ({ onBack }: { onBack: () => void }) =>
      React.createElement(
        View,
        { testID: 'reader-comics' },
        React.createElement(
          Pressable,
          { testID: 'reader-back', onPress: onBack },
          React.createElement(Text, null, 'back'),
        ),
      ),
  };
});

// Capture goBack so we can assert the back chevron pops the screen.
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
    useRoute: () => ({ params: { fileId: '42' }, key: 'r', name: 'Reader' }),
  };
});

import Reader from '@/screens/reader/Reader';

async function renderReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Reader />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

const comicsManifest: ReaderManifest = {
  readableKey: 'page:file:42',
  contentType: 'comic',
  reader: 'comics',
  format: 'cbz',
  title: 'Berserk',
  seriesId: 1,
  volumeId: 7,
  volumeLabel: 'Vol. 1',
  pageCount: 200,
  progress: {
    readableKey: 'page:file:42',
    position: 0,
    locator: { page: 1 },
    finished: false,
    restartedFromFinish: false,
  },
};

beforeEach(() => {
  mockGoBack.mockClear();
  mockUseReaderManifest.mockReset();
});

it('passes the numeric fileId from route params to the hook', async () => {
  mockUseReaderManifest.mockReturnValue({ isLoading: true, isError: false, data: undefined });
  await renderReader();
  expect(mockUseReaderManifest).toHaveBeenCalledWith({ fileId: 42 });
});

it('shows a loading indicator while the manifest loads', async () => {
  mockUseReaderManifest.mockReturnValue({ isLoading: true, isError: false, data: undefined });
  await renderReader();
  expect(screen.getByTestId('reader-loading')).toBeTruthy();
});

it('shows an error message when the manifest fails', async () => {
  mockUseReaderManifest.mockReturnValue({ isLoading: false, isError: true, data: undefined });
  await renderReader();
  expect(screen.getByTestId('reader-error')).toBeTruthy();
});

it('dispatches a comics manifest to the comics reader', async () => {
  mockUseReaderManifest.mockReturnValue({ isLoading: false, isError: false, data: comicsManifest });
  await renderReader();
  expect(screen.getByTestId('reader-comics')).toBeTruthy();
});

it('pressing the back chevron pops the screen', async () => {
  mockUseReaderManifest.mockReturnValue({ isLoading: false, isError: false, data: comicsManifest });
  await renderReader();
  await fireEvent.press(screen.getByTestId('reader-back'));
  expect(mockGoBack).toHaveBeenCalled();
});
