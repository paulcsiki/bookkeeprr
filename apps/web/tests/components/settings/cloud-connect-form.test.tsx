/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CloudConnectForm } from '@/app/(app)/settings/cloud/CloudConnectForm';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const TERMS = {
  eulaVersion: '2.0',
  eulaUrl: 'https://cloud.example/eula',
  privacyVersion: '1.5',
  privacyUrl: 'https://cloud.example/privacy',
  effectiveAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url === '/api/settings/cloud/terms') {
      return new Response(JSON.stringify({ terms: TERMS }), { status: 200 });
    }
    // connect POST + anything else
    return new Response('{}', { status: 200 });
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('CloudConnectForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches terms, gates Connect behind both consent toggles, then POSTs and navigates back', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    const { toast } = await import('sonner');
    render(<CloudConnectForm cloudBaseUrl="https://cloud.example" />);

    // Terms load asynchronously.
    await waitFor(() => expect(screen.getByText(/EULA v2\.0/)).toBeTruthy());

    const connect = screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement;
    // Guard: with toggles unticked, Connect is disabled.
    expect(connect.disabled).toBe(true);

    // Tick both consent checkboxes (EULA + Privacy).
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(2);
    for (const cb of checkboxes) fireEvent.click(cb);

    await waitFor(() => expect(connect.disabled).toBe(false));
    fireEvent.click(connect);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/settings/cloud/connect',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    const call = (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/api/settings/cloud/connect',
    );
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string) as {
      acceptedEulaVersion: string;
      acceptedPrivacyVersion: string;
    };
    expect(body.acceptedEulaVersion).toBe('2.0');
    expect(body.acceptedPrivacyVersion).toBe('1.5');

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Connected to cloud');
      expect(push).toHaveBeenCalledWith('/settings/cloud');
    });
    // /settings/cloud is force-dynamic: navigating re-fetches fresh state, so no
    // redundant router.refresh() should be issued.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not POST connect while consent toggles are unticked', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    render(<CloudConnectForm cloudBaseUrl="https://cloud.example" />);

    await waitFor(() => expect(screen.getByText(/EULA v2\.0/)).toBeTruthy());

    const connect = screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
    fireEvent.click(connect);

    // Only the terms GET should have fired — no connect POST, no navigation.
    expect(
      (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
        (c) => c[0] === '/api/settings/cloud/connect',
      ),
    ).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('surfaces a connect failure and does not navigate', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    const { toast } = await import('sonner');
    (apiFetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/settings/cloud/terms') {
        return new Response(JSON.stringify({ terms: TERMS }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'Connect failed' }), { status: 500 });
    });

    render(<CloudConnectForm cloudBaseUrl="https://cloud.example" />);
    await waitFor(() => expect(screen.getByText(/EULA v2\.0/)).toBeTruthy());

    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) fireEvent.click(cb);

    const connect = screen.getByRole('button', { name: 'Connect' });
    await waitFor(() => expect((connect as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(connect);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Connect failed'));
    expect(push).not.toHaveBeenCalled();
  });
});
