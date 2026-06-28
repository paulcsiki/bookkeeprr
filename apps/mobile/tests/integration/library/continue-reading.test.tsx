import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ContinueReadingItem } from '@/api/schemas';

// A stable bearer token drives the cover-image Authorization header.
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

// Capture navigation so we can assert the Reader route + params each card uses.
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
    // The rail refetches on focus; run the effect once and skip the real
    // navigation-context plumbing (no NavigationContainer in this test).
    useFocusEffect: (cb: () => void | (() => void)) => {
      cb();
    },
  };
});

// Drive the rail's data off a mocked hook so the test owns the item shape.
// `refetch` is always present (the rail calls it on focus); individual tests can
// still override `data` via mockReturnValue.
const mockUseContinueReading = jest.fn();
jest.mock('@/api/hooks/useContinueReading', () => ({
  useContinueReading: () => ({ refetch: jest.fn(), ...mockUseContinueReading() }),
}));

// Mock the reset mutation so the long-press → remove flow stays isolated (no
// QueryClient / network needed); the test just asserts it fires with the key.
const mockReset = jest.fn();
jest.mock('@/api/hooks/useResetReadingProgress', () => ({
  useResetReadingProgress: () => ({ mutate: mockReset, isPending: false }),
}));

import { AuthProvider } from '@/auth/AuthContext';
import { ContinueReadingRail } from '@/features/library/ContinueReadingRail';

function item(overrides: Partial<ContinueReadingItem> = {}): ContinueReadingItem {
  return {
    id: 1,
    readableKey: 'page:file:42',
    seriesId: 7,
    volumeId: 3,
    libraryFileId: 42,
    contentType: 'comic',
    position: 0.5,
    locatorJson: '{"page":10}',
    finished: false,
    updatedAt: 1_700_000_000_000,
    title: 'Berserk',
    coverUrl: 'https://srv/cover/7.jpg',
    ...overrides,
  };
}

async function renderRail() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <ContinueReadingRail />
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockUseContinueReading.mockReset();
  mockReset.mockClear();
});

it('renders nothing when there are no items', async () => {
  mockUseContinueReading.mockReturnValue({ data: { items: [] } });
  await renderRail();
  expect(screen.queryByTestId('continue-reading-rail')).toBeNull();
});

it('renders nothing while loading (no data yet)', async () => {
  mockUseContinueReading.mockReturnValue({ data: undefined });
  await renderRail();
  expect(screen.queryByTestId('continue-reading-rail')).toBeNull();
});

it('renders a card per item with title and mono percentage', async () => {
  mockUseContinueReading.mockReturnValue({
    data: { items: [item({ id: 1, position: 0.5, title: 'Berserk' })] },
  });
  await renderRail();
  expect(screen.getByTestId('continue-reading-rail')).toBeTruthy();
  expect(screen.getByTestId('continue-card-1')).toBeTruthy();
  expect(screen.getByText('Berserk')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
});

it('drops finished books from the rail (a fully-read title leaves Continue Reading)', async () => {
  mockUseContinueReading.mockReturnValue({
    data: {
      items: [
        item({ id: 2, finished: true, position: 1 }),
        item({ id: 3, finished: false, position: 0.99999 }),
      ],
    },
  });
  await renderRail();
  // Both the finished item and the at-the-end item are filtered out; with no
  // in-progress items left, the whole rail is hidden.
  expect(screen.queryByTestId('continue-reading-rail')).toBeNull();
  expect(screen.queryByTestId('continue-card-2')).toBeNull();
});

it('maps the server light_novel/audiobook content types onto the mobile pill types', async () => {
  mockUseContinueReading.mockReturnValue({
    data: {
      items: [
        item({ id: 3, contentType: 'light_novel', readableKey: 'page:file:9' }),
        item({ id: 4, contentType: 'audiobook', readableKey: 'audio:vol:5', volumeId: 5 }),
      ],
    },
  });
  await renderRail();
  // ContentTypePill renders the mapped type as its text node ('novel'/'audio');
  // the uppercase appearance is a textTransform style, not the text content.
  expect(screen.getByText('novel')).toBeTruthy();
  expect(screen.getByText('audio')).toBeTruthy();
});

it('navigates to the Reader with fileId for a paged readable', async () => {
  mockUseContinueReading.mockReturnValue({
    data: { items: [item({ id: 1, readableKey: 'page:file:42' })] },
  });
  await renderRail();
  await fireEvent.press(screen.getByTestId('continue-card-1'));
  expect(mockNavigate).toHaveBeenCalledWith('Reader', { fileId: '42' });
});

it('navigates to the Reader with volumeId for an audio readable', async () => {
  mockUseContinueReading.mockReturnValue({
    data: {
      items: [item({ id: 5, readableKey: 'audio:vol:5', contentType: 'audiobook', volumeId: 5 })],
    },
  });
  await renderRail();
  await fireEvent.press(screen.getByTestId('continue-card-5'));
  expect(mockNavigate).toHaveBeenCalledWith('Reader', { volumeId: '5' });
});

it('long-pressing a card opens the remove sheet and confirming resets that volume', async () => {
  mockUseContinueReading.mockReturnValue({
    data: { items: [item({ id: 1, readableKey: 'page:file:42', title: 'Berserk' })] },
  });
  await renderRail();

  // No sheet until a long-press.
  expect(screen.queryByTestId('continue-remove-sheet')).toBeNull();
  await fireEvent(screen.getByTestId('continue-card-1'), 'longPress');
  expect(screen.getByTestId('continue-remove-sheet')).toBeTruthy();

  // A normal tap on the confirm button must NOT have navigated to the reader.
  await fireEvent.press(screen.getByTestId('continue-remove-confirm'));
  expect(mockReset).toHaveBeenCalledWith('page:file:42', expect.any(Object));
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('cancelling the remove sheet leaves progress untouched', async () => {
  mockUseContinueReading.mockReturnValue({
    data: { items: [item({ id: 1, readableKey: 'page:file:42' })] },
  });
  await renderRail();

  await fireEvent(screen.getByTestId('continue-card-1'), 'longPress');
  await fireEvent.press(screen.getByTestId('continue-remove-cancel'));
  expect(mockReset).not.toHaveBeenCalled();
  expect(screen.queryByTestId('continue-remove-sheet')).toBeNull();
});

it('caps the rail at six cards', async () => {
  const items = Array.from({ length: 9 }, (_, i) =>
    item({ id: i + 1, readableKey: `page:file:${i + 1}` }),
  );
  mockUseContinueReading.mockReturnValue({ data: { items } });
  await renderRail();
  expect(screen.getByTestId('continue-card-1')).toBeTruthy();
  expect(screen.getByTestId('continue-card-6')).toBeTruthy();
  expect(screen.queryByTestId('continue-card-7')).toBeNull();
});
