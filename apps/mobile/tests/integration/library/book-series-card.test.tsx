/**
 * Integration tests for BookSeriesCard and BookSeriesRow.
 *
 * Tests that each component renders a single representative cover via <Cover>
 * when coverUrl is non-null, and degrades gracefully to the gradient placeholder
 * when coverUrl is null — retaining the BookCopy affordance and count subline.
 *
 * Components are rendered directly with props; no MSW/API layer needed.
 */
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookSeriesCard } from '@/features/library/BookSeriesCard';
import { BookSeriesRow } from '@/features/library/BookSeriesRow';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import type { BookSeriesSummary } from '@/api/schemas/book-series';

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

const SERIES_WITH_COVER: BookSeriesSummary = {
  id: 42,
  name: 'The Stormlight Archive',
  contentType: 'ebook',
  coverUrl: 'https://srv/api/img/stormlight.webp',
  totalBooks: 5,
  memberCount: 3,
  source: 'googlebooks',
};

const SERIES_NO_COVER: BookSeriesSummary = {
  id: 99,
  name: 'Mistborn',
  contentType: 'ebook',
  coverUrl: null,
  totalBooks: 3,
  memberCount: 2,
  source: 'googlebooks',
};

async function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          {ui}
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

function treeJson() {
  const seen = new WeakSet<object>();
  return JSON.stringify(screen.toJSON(), (_k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return v;
  });
}

// ─── BookSeriesCard ───────────────────────────────────────────────────────────

describe('BookSeriesCard', () => {
  it('renders the card testID and name', async () => {
    await wrap(<BookSeriesCard bookSeries={SERIES_WITH_COVER} onPress={jest.fn()} />);
    expect(screen.getByTestId('book-series-card-42')).toBeTruthy();
    expect(screen.getByText('The Stormlight Archive')).toBeTruthy();
  });

  it('renders the BOOKS IN SERIES subline', async () => {
    await wrap(<BookSeriesCard bookSeries={SERIES_WITH_COVER} onPress={jest.fn()} />);
    expect(screen.getByText('3 BOOKS IN SERIES')).toBeTruthy();
  });

  it('renders "1 BOOK IN SERIES" singular', async () => {
    const single = { ...SERIES_WITH_COVER, memberCount: 1 };
    await wrap(<BookSeriesCard bookSeries={single} onPress={jest.fn()} />);
    expect(screen.getByText('1 BOOK IN SERIES')).toBeTruthy();
  });

  it('with coverUrl: cover container testID is present', async () => {
    await wrap(<BookSeriesCard bookSeries={SERIES_WITH_COVER} onPress={jest.fn()} />);
    expect(screen.getByTestId('book-series-card-cover-42')).toBeTruthy();
  });

  it('with coverUrl: the cover uri appears in the rendered tree', async () => {
    await wrap(<BookSeriesCard bookSeries={SERIES_WITH_COVER} onPress={jest.fn()} />);
    const tree = treeJson();
    expect(tree).toContain('"uri":"https://srv/api/img/stormlight.webp"');
  });

  it('with coverUrl null: renders without crashing and shows subline', async () => {
    await wrap(<BookSeriesCard bookSeries={SERIES_NO_COVER} onPress={jest.fn()} />);
    expect(screen.getByTestId('book-series-card-99')).toBeTruthy();
    expect(screen.getByText('2 BOOKS IN SERIES')).toBeTruthy();
  });

  it('with coverUrl null: no image uri in the tree (placeholder only)', async () => {
    await wrap(<BookSeriesCard bookSeries={SERIES_NO_COVER} onPress={jest.fn()} />);
    const tree = treeJson();
    // No FastImage image source uri should be present in the null-cover case.
    expect(tree).not.toContain('"uri":"http');
  });

  it('with coverUrl null: BookCopy affordance corner badge still present', async () => {
    await wrap(<BookSeriesCard bookSeries={SERIES_NO_COVER} onPress={jest.fn()} />);
    // Card structure is intact; testID confirms no crash and badge is present.
    expect(screen.getByTestId('book-series-card-99')).toBeTruthy();
    expect(screen.getByTestId('book-series-card-badge-99')).toBeTruthy();
  });
});

// ─── BookSeriesRow ────────────────────────────────────────────────────────────

describe('BookSeriesRow', () => {
  it('renders the row testID and name', async () => {
    await wrap(<BookSeriesRow bookSeries={SERIES_WITH_COVER} onPress={jest.fn()} />);
    expect(screen.getByTestId('book-series-row-42')).toBeTruthy();
    expect(screen.getByText('The Stormlight Archive')).toBeTruthy();
  });

  it('renders the BOOKS IN SERIES subline', async () => {
    await wrap(<BookSeriesRow bookSeries={SERIES_WITH_COVER} onPress={jest.fn()} />);
    expect(screen.getByText('3 BOOKS IN SERIES')).toBeTruthy();
  });

  it('with coverUrl: cover container testID is present', async () => {
    await wrap(<BookSeriesRow bookSeries={SERIES_WITH_COVER} onPress={jest.fn()} />);
    expect(screen.getByTestId('book-series-row-cover-42')).toBeTruthy();
  });

  it('with coverUrl: the cover uri appears in the rendered tree', async () => {
    await wrap(<BookSeriesRow bookSeries={SERIES_WITH_COVER} onPress={jest.fn()} />);
    const tree = treeJson();
    expect(tree).toContain('"uri":"https://srv/api/img/stormlight.webp"');
  });

  it('with coverUrl null: renders without crashing and shows subline', async () => {
    await wrap(<BookSeriesRow bookSeries={SERIES_NO_COVER} onPress={jest.fn()} />);
    expect(screen.getByTestId('book-series-row-99')).toBeTruthy();
    expect(screen.getByText('2 BOOKS IN SERIES')).toBeTruthy();
  });

  it('with coverUrl null: no image uri in the tree (placeholder only)', async () => {
    await wrap(<BookSeriesRow bookSeries={SERIES_NO_COVER} onPress={jest.fn()} />);
    const tree = treeJson();
    expect(tree).not.toContain('"uri":"http');
  });

  it('with coverUrl null: BookCopy affordance corner badge still present', async () => {
    await wrap(<BookSeriesRow bookSeries={SERIES_NO_COVER} onPress={jest.fn()} />);
    expect(screen.getByTestId('book-series-row-99')).toBeTruthy();
    expect(screen.getByTestId('book-series-row-badge-99')).toBeTruthy();
  });
});
