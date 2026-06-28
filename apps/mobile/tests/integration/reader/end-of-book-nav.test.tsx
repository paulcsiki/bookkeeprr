import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import type { ReaderManifest } from '@/api/schemas';

// Keep auth unauthenticated so the end-of-book auto-download block is skipped;
// this test only cares about how the "Next volume" prompt navigates.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockUseReaderManifest = jest.fn();
jest.mock('@/api/hooks/useReaderManifest', () => ({
  useReaderManifest: (...args: unknown[]) => mockUseReaderManifest(...args),
}));

// Drive the series query so onReachedEnd finds a next volume to continue to.
const mockUseSeries = jest.fn();
jest.mock('@/api/hooks/useSeries', () => ({
  useSeries: (...args: unknown[]) => mockUseSeries(...args),
}));

// Stub ComicsReader with a surface that exposes a control to fire onReachedEnd,
// standing in for the user paging past the last page.
jest.mock('@/features/reader/ComicsReader', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Pressable, Text } = require('react-native');
  return {
    ComicsReader: ({ onReachedEnd }: { onReachedEnd: () => void }) =>
      React.createElement(
        View,
        { testID: 'reader-comics' },
        React.createElement(
          Pressable,
          { testID: 'reach-end', onPress: onReachedEnd },
          React.createElement(Text, null, 'end'),
        ),
      ),
  };
});

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      goBack: jest.fn(),
      push: mockPush,
      replace: mockReplace,
      navigate: mockNavigate,
      getParent: () => ({ navigate: jest.fn() }),
    }),
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
  mockPush.mockClear();
  mockReplace.mockClear();
  mockNavigate.mockClear();
  mockUseReaderManifest.mockReset();
  mockUseSeries.mockReset();
  mockUseReaderManifest.mockReturnValue({ isLoading: false, isError: false, data: comicsManifest });
  mockUseSeries.mockReturnValue({
    data: {
      volumesList: [
        { id: 7, libraryFileId: 42, title: 'Vol. 1' },
        { id: 8, libraryFileId: 43, title: 'Vol. 2' },
      ],
    },
  });
});

// Reaching the end of one volume and choosing "Next volume" must REPLACE the
// current reader rather than push a new one on top — otherwise each finished
// volume is left on the stack, and the back chevron walks back through every
// previously-read volume instead of exiting the reader.
it('replaces the reader (does not push) when continuing to the next volume', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    const next = buttons?.find((b) => b.text === 'Next volume');
    next?.onPress?.();
  });

  await renderReader();
  await fireEvent.press(screen.getByTestId('reach-end'));

  expect(mockReplace).toHaveBeenCalledWith('Reader', { fileId: '43' });
  expect(mockPush).not.toHaveBeenCalled();

  alertSpy.mockRestore();
});
