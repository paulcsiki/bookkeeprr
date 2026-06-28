import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { fixtureAuditEvents } from '../../mocks/fixtures';
import Audit from '@/screens/settings/Audit';
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

function renderAudit() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Audit />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('applies a free-text action filter (URL carries action=<value>)', async () => {
  const seen: string[] = [];
  server.use(
    http.get('https://srv/api/mobile/audit/events', ({ request }) => {
      seen.push(request.url);
      return HttpResponse.json({ rows: fixtureAuditEvents, total: fixtureAuditEvents.length });
    }),
  );

  await act(async () => {
    renderAudit();
  });
  await waitFor(() => expect(screen.getByTestId('audit-row-1')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('audit-action-filter'), 'added series');
  });
  await act(async () => {
    fireEvent(screen.getByTestId('audit-action-filter'), 'submitEditing', {
      nativeEvent: { text: 'added series' },
    });
  });

  await waitFor(() => {
    expect(
      seen.some((u) => u.includes('action=added+series') || u.includes('action=added%20series')),
    ).toBe(true);
  });
});

it('tapping a row opens the detail sheet showing action + target', async () => {
  await act(async () => {
    renderAudit();
  });
  await waitFor(() => expect(screen.getByTestId('audit-row-1')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('audit-row-1'));
  });

  await waitFor(() => expect(screen.getByTestId('audit-detail-sheet')).toBeTruthy());
  const sheet = screen.getByTestId('audit-detail-sheet');
  expect(within(sheet).getByText('added series')).toBeTruthy();
  expect(within(sheet).getByText('series:vinland-saga')).toBeTruthy();
});
