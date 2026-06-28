/**
 * Integration tests for the BookSeriesDetail screen.
 *
 * Two things are proven here:
 *
 *  1. Missing-books rendering (the #3 PROOF): the detail response carries books
 *     that are NOT owned locally. Owned books render a "View" control
 *     (testID `owned-book-${seriesId}`); unowned books render an "Add" control
 *     (testID `missing-book-add`); the MISSING stat reflects totalBooks - owned.
 *
 *  2. The tablet hero is a constrained, left-aligned poster (not a full-bleed
 *     hero that balloons to fill the pane). We force a tablet window and assert
 *     the `bs-hero` wrapper renders and carries the max-width / left-align
 *     constraint.
 *
 * The screen is forced into tablet mode for the whole file (1180×820) — the books
 * list renders identically in both form factors, so the owned/Add/MISSING
 * assertions hold here too while also exercising the constrained-poster path.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookSeriesDetail from '@/screens/library/BookSeriesDetail';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import type { BookSeriesDetailResponse } from '@/api/schemas/book-series';
import { server } from '../../mocks/server';

const BASE = 'https://srv';

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
      expiresAt: '2026-08-25T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: { bookSeriesId: '1' } }),
  };
});

// Detail with 2 owned + 1 unowned book. The unowned (position 3) is the
// missing book the screen surfaces with an "Add" affordance.
const detail: BookSeriesDetailResponse = {
  id: 1,
  name: 'The Wheel of Time',
  contentType: 'ebook',
  coverUrl: 'https://srv/api/img/wot.webp',
  totalBooks: 3,
  memberCount: 2,
  source: 'googlebooks',
  description: 'An epic fantasy series.',
  books: [
    { position: 1, title: 'The Eye of the World', externalRef: 'wot-1', coverUrl: null, owned: true, seriesId: 101 },
    { position: 2, title: 'The Great Hunt', externalRef: 'wot-2', coverUrl: null, owned: true, seriesId: 102 },
    { position: 3, title: 'The Dragon Reborn', externalRef: 'wot-3', coverUrl: null, owned: false, seriesId: null },
  ],
};

function useDetail(d: BookSeriesDetailResponse = detail) {
  server.use(http.get(`${BASE}/api/book-series/1`, () => HttpResponse.json(d)));
}

async function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <BookSeriesDetail />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('BookSeriesDetail — missing-books proof', () => {
  it('renders a "View" control for each owned book', async () => {
    useDetail();
    await wrap();
    await waitFor(() => expect(screen.getByTestId('owned-book-101')).toBeTruthy());
    expect(screen.getByTestId('owned-book-102')).toBeTruthy();
  });

  it('renders the "Add" control for an unowned (missing) book', async () => {
    useDetail();
    await wrap();
    await waitFor(() => expect(screen.getByTestId('missing-book-add')).toBeTruthy());
  });

  it('does not render a "View" control for the unowned book', async () => {
    useDetail();
    await wrap();
    await waitFor(() => expect(screen.getByTestId('missing-book-add')).toBeTruthy());
    // Only the two owned books have an owned-book-* control; the unowned book
    // (seriesId null) must not produce one.
    expect(screen.queryByTestId('owned-book-null')).toBeNull();
  });

  it('shows the correct MISSING stat count (totalBooks - owned)', async () => {
    useDetail();
    await wrap();
    await waitFor(() => expect(screen.getByTestId('missing-book-add')).toBeTruthy());
    // 3 total − 2 owned = 1 missing. Scope to the MISSING stat's value so the
    // assertion isn't confused by the position badges ("1", "2") in the list.
    expect(screen.getByText('MISSING')).toBeTruthy();
    expect(screen.getByTestId('bs-stat-MISSING')).toHaveTextContent('1');
  });
});

describe('BookSeriesDetail — tablet hero', () => {
  it('renders the constrained, left-aligned poster (bs-hero) on tablet', async () => {
    useDetail();
    await wrap();
    const hero = await screen.findByTestId('bs-hero');
    expect(hero).toBeTruthy();
    // Robust: assert the constraint on the wrapper rather than a pixel-exact
    // image size. flatten handles array styles.
    const style = Array.isArray(hero.props.style)
      ? Object.assign({}, ...hero.props.style)
      : hero.props.style;
    expect(style.maxWidth).toBe(340);
    expect(style.alignSelf).toBe('flex-start');
  });
});
