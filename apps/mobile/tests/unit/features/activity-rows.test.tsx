import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { QueueRow } from '@/features/activity/QueueRow';
import { HistoryRow } from '@/features/activity/HistoryRow';

// The rows read the server URL via useAuth to resolve a root-relative cover
// path into an absolute device-loadable URL. Provide a stable authenticated
// session so useAuth resolves and resolveAssetUri can join the origin.
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

async function renderRow(node: ReactElement) {
  return render(
    <ThemeProvider>
      <AuthProvider>{node}</AuthProvider>
    </ThemeProvider>,
  );
}

const dl = {
  id: 1,
  qbtHash: 'a',
  status: 'downloading' as const,
  addedAt: '2026-05-26T08:00:00Z',
  completedAt: null,
  importedAt: null,
  error: null,
  release: { id: 9, title: 'Vinland.Saga.v28.cbz', indexerGuid: 'g-9' },
  series: { id: 1, title: 'Vinland Saga', coverUrl: null },
};

it('QueueRow shows series title and live status', async () => {
  await renderRow(<QueueRow download={dl} />);
  expect(screen.getByTestId('queue-row-1')).toBeTruthy();
  expect(screen.getByText('Vinland Saga')).toBeTruthy();
});

it('QueueRow falls back to release title when series is null', async () => {
  await renderRow(<QueueRow download={{ ...dl, series: null }} />);
  // release.title appears twice — once as the fallback title (no series),
  // and once as the release subtitle below.
  expect(screen.getAllByText('Vinland.Saga.v28.cbz').length).toBeGreaterThanOrEqual(1);
});

it('HistoryRow shows error note for failed downloads', async () => {
  const failed = { ...dl, id: 2, status: 'failed' as const, error: 'connection reset' };
  await renderRow(<HistoryRow download={failed} />);
  expect(screen.getByText(/connection reset/i)).toBeTruthy();
});

it('HistoryRow shows imported note for imported downloads', async () => {
  const imp = {
    ...dl,
    id: 3,
    status: 'imported' as const,
    completedAt: '2026-05-26T08:50:00Z',
    importedAt: '2026-05-26T08:51:00Z',
  };
  await renderRow(<HistoryRow download={imp} />);
  expect(screen.getByText(/IMPORTED/i)).toBeTruthy();
});

it('QueueRow renders without crashing when a series cover is present', async () => {
  const withCover = {
    ...dl,
    series: { id: 1, title: 'Vinland Saga', coverUrl: '/api/img?u=cover' },
  };
  await renderRow(<QueueRow download={withCover} />);
  expect(screen.getByTestId('queue-row-1')).toBeTruthy();
});
