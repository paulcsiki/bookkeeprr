import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FilterSheet from '@/screens/library/FilterSheet';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { useLibraryFilter } from '@/state/libraryFilterStore';

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

async function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => useLibraryFilter.getState().reset());

it('toggles a content type', async () => {
  await wrap(<FilterSheet />);
  await fireEvent.press(screen.getByTestId('cb-manga'));
  await waitFor(() => expect(useLibraryFilter.getState().contentTypes).toEqual(['manga']));
});

it('changes sort', async () => {
  await wrap(<FilterSheet />);
  await fireEvent.press(screen.getByTestId('radio-title:asc'));
  await waitFor(() => expect(useLibraryFilter.getState().sort).toBe('title:asc'));
});

it('sets the reading facet', async () => {
  await wrap(<FilterSheet />);
  await fireEvent.press(screen.getByTestId('filter-read-finished'));
  await waitFor(() => expect(useLibraryFilter.getState().read).toBe('finished'));
});

it('sets the monitoring facet', async () => {
  await wrap(<FilterSheet />);
  await fireEvent.press(screen.getByTestId('filter-mon-unmonitored'));
  await waitFor(() => expect(useLibraryFilter.getState().mon).toBe('unmonitored'));
});

it('sets the health facet', async () => {
  await wrap(<FilterSheet />);
  await fireEvent.press(screen.getByTestId('filter-health-missing'));
  await waitFor(() => expect(useLibraryFilter.getState().health).toBe('missing'));
});

it('resets all facets to defaults', async () => {
  useLibraryFilter.getState().toggleContentType('manga');
  useLibraryFilter.getState().setSort('title:asc');
  useLibraryFilter.getState().setRead('finished');
  useLibraryFilter.getState().setMon('unmonitored');
  useLibraryFilter.getState().setHealth('missing');
  await wrap(<FilterSheet />);
  await fireEvent.press(screen.getByTestId('btn-filter-reset'));
  await waitFor(() => {
    expect(useLibraryFilter.getState().contentTypes).toEqual([]);
    expect(useLibraryFilter.getState().sort).toBe('added_at:desc');
    expect(useLibraryFilter.getState().read).toBe('all');
    expect(useLibraryFilter.getState().mon).toBe('all');
    expect(useLibraryFilter.getState().health).toBe('all');
  });
});

it('shows dynamic Show N series label after data loads', async () => {
  await wrap(<FilterSheet />);
  await waitFor(() => expect(screen.getByText(/Show \d+ series/)).toBeTruthy());
});

function ctaCount(): number {
  const node = screen.getByText(/Show \d+ series/);
  const label = String(node.props.children);
  return Number(/Show (\d+) series/.exec(label)?.[1] ?? '0');
}

it('the count CTA drops when a facet narrows the list', async () => {
  await wrap(<FilterSheet />);
  await screen.findByText(/Show \d+ series/);
  const fullCount = ctaCount();
  expect(fullCount).toBeGreaterThan(0);
  // Health=missing should match strictly fewer of the fixture rows.
  await fireEvent.press(screen.getByTestId('filter-health-missing'));
  await waitFor(() => expect(ctaCount()).toBeLessThan(fullCount));
});
