import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { useNotifications } from '@/api/hooks/useNotifications';
import { useSaveNotifications } from '@/api/hooks/useSaveNotifications';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';

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

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
}

const defaultNotifications = {
  discordWebhookUrl: '••••••••',
  discordWebhookConfigured: true,
  discordUsername: 'bookkeeprr',
  discordAvatarUrl: null,
  appriseUrl: null,
  appriseConfigured: false,
  eventGrabSuccess: true,
  eventImportSuccess: true,
  eventFailure: true,
  eventUpdateAvailable: false,
};

describe('useNotifications', () => {
  it('GETs notifications config from /api/settings/notifications', async () => {
    server.use(
      http.get('https://srv/api/settings/notifications', () =>
        HttpResponse.json(defaultNotifications),
      ),
    );

    const { result } = await renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.discordWebhookUrl).toBe('••••••••');
    expect(result.current.data?.discordWebhookConfigured).toBe(true);
    expect(result.current.data?.discordUsername).toBe('bookkeeprr');
    expect(result.current.data?.appriseConfigured).toBe(false);
    expect(result.current.data?.eventGrabSuccess).toBe(true);
    expect(result.current.data?.eventUpdateAvailable).toBe(false);
  });
});

describe('useSaveNotifications', () => {
  it('PATCHes /api/settings/notifications with the provided body', async () => {
    let patchBody: Record<string, unknown> | null = null;
    server.use(
      http.get('https://srv/api/settings/notifications', () =>
        HttpResponse.json(defaultNotifications),
      ),
      http.patch('https://srv/api/settings/notifications', async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true });
      }),
    );

    const { result } = await renderHook(() => useSaveNotifications(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    const savePayload = {
      discordWebhookUrl: '',
      discordUsername: 'bookkeeprr',
      discordAvatarUrl: null,
      appriseUrl: '',
      eventGrabSuccess: false,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: false,
    };

    await act(async () => {
      await result.current.mutateAsync(savePayload);
    });

    expect(patchBody).not.toBeNull();
    expect(patchBody).toEqual(savePayload);
    // Webhook blank = keep stored (server handles it), body accurately reflects UI
    expect(patchBody!['discordWebhookUrl']).toBe('');
    expect(patchBody!['eventGrabSuccess']).toBe(false);
    // Must NOT include push* keys
    expect(patchBody!['pushGrabSuccess']).toBeUndefined();
    expect(patchBody!['pushImportSuccess']).toBeUndefined();
    expect(patchBody!['pushFailure']).toBeUndefined();
    expect(patchBody!['pushUpdateAvailable']).toBeUndefined();
  });
});
