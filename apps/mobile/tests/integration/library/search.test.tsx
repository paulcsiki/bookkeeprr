import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Library from '@/screens/library/LibraryHome';
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

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Library />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => useLibraryFilter.getState().reset());

// Regression: a search that matched nothing used to drop the whole screen to a
// bare EmptyState with no AppBar — hiding the search field and filter button, so
// the only way to clear the query was to restart the app. The search field must
// stay mounted and an inline "no matches" message must render instead.
it('keeps the search field mounted and shows "no matches" on an empty result', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy(), { timeout: 15_000 });

  fireEvent.press(screen.getByTestId('btn-search'));
  const input = await screen.findByTestId('input-library-search');
  fireEvent.changeText(input, 'zzz-no-such-series');

  await waitFor(() => expect(screen.getByTestId('library-no-matches')).toBeTruthy(), {
    timeout: 15_000,
  });
  // The field is still on screen and still holds the query → it's clearable.
  expect(screen.getByTestId('input-library-search')).toBeTruthy();
  expect(screen.getByTestId('input-library-search').props.value).toBe('zzz-no-such-series');
}, 25_000);

it('shows matching series and hides non-matches when searching', async () => {
  wrap();
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy(), { timeout: 15_000 });

  fireEvent.press(screen.getByTestId('btn-search'));
  const input = await screen.findByTestId('input-library-search');
  fireEvent.changeText(input, 'vinland');

  await waitFor(() => expect(screen.queryByText('Berserk')).toBeNull(), { timeout: 15_000 });
  expect(screen.getByText('Vinland Saga')).toBeTruthy();
}, 25_000);
