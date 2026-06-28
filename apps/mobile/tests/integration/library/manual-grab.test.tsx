import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import InteractiveSearch from '@/screens/library/InteractiveSearch';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';

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
    useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
    useRoute: () => ({ params: { seriesId: '1' } }),
  };
});

const MAGNET = 'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a';

async function openSheet() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <InteractiveSearch />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('btn-manual-grab')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('btn-manual-grab'));
  await waitFor(() => expect(screen.getByTestId('input-magnet')).toBeTruthy());
}

it('POSTs the pasted magnet and confirms success', async () => {
  let received: unknown = null;
  server.use(
    http.post('https://srv/api/series/:id/manual-grab', async ({ request, params }) => {
      received = { id: params.id, body: await request.json() };
      return HttpResponse.json({ releaseId: 42, downloadId: 7 }, { status: 201 });
    }),
  );
  await openSheet();
  await fireEvent.changeText(screen.getByTestId('input-magnet'), MAGNET);
  await fireEvent.press(screen.getByTestId('manual-grab-submit'));

  await waitFor(() => expect(received).toEqual({ id: '1', body: { magnet: MAGNET } }));
  // Sheet closes; inline confirmation points at Activity.
  await waitFor(() => expect(screen.queryByTestId('input-magnet')).toBeNull());
  expect(screen.getByText('Magnet added. The download will show up in Activity.')).toBeTruthy();
});

it('rejects an invalid magnet client-side without POSTing', async () => {
  let posted = false;
  server.use(
    http.post('https://srv/api/series/:id/manual-grab', () => {
      posted = true;
      return HttpResponse.json({ releaseId: 1, downloadId: 1 }, { status: 201 });
    }),
  );
  await openSheet();
  await fireEvent.changeText(screen.getByTestId('input-magnet'), 'https://not-a-magnet.example');
  await fireEvent.press(screen.getByTestId('manual-grab-submit'));

  await waitFor(() => expect(screen.getByTestId('manual-grab-error')).toBeTruthy());
  expect(screen.getByText("That magnet link doesn't look valid.")).toBeTruthy();
  expect(posted).toBe(false);
  // Sheet stays open for a retry.
  expect(screen.getByTestId('input-magnet')).toBeTruthy();
});

it('surfaces the duplicate-grab 409 as an InlineAlert', async () => {
  server.use(
    http.post('https://srv/api/series/:id/manual-grab', () =>
      HttpResponse.json({ error: 'duplicate' }, { status: 409 }),
    ),
  );
  await openSheet();
  await fireEvent.changeText(screen.getByTestId('input-magnet'), MAGNET);
  await fireEvent.press(screen.getByTestId('manual-grab-submit'));

  await waitFor(() => expect(screen.getByTestId('manual-grab-error')).toBeTruthy());
  expect(screen.getByText('You already grabbed this torrent for this title.')).toBeTruthy();
});
