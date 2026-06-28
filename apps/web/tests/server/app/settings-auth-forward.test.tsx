/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForwardAuthForm } from '@/app/(app)/settings/auth/ForwardAuthForm';

// The form's unsaved-changes guard calls useRouter; stub navigation.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

const INITIAL = {
  enabled: false,
  trustedProxies: ['10.0.0.0/8'],
  userHeader: 'Remote-User',
  emailHeader: 'Remote-Email',
  groupsHeader: 'Remote-Groups',
  autoCreateUsers: true,
  allowedGroups: [],
  adminGroups: [],
};

describe('ForwardAuthForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the trusted-proxies chips and header inputs', () => {
    render(<ForwardAuthForm initial={INITIAL} />);
    expect(screen.getByText('10.0.0.0/8')).toBeTruthy();
    expect(screen.getByLabelText(/Trusted proxies/i)).toBeTruthy();
    expect((screen.getByLabelText(/User header/i) as HTMLInputElement).value).toBe('Remote-User');
  });

  it('calls /api/auth/forward-auth/validate when "Validate connection" is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ready: true,
          peerIp: '10.0.0.42',
          peerInTrustedProxies: true,
          userHeaderPresent: true,
          userHeaderValue: 'alice',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    render(<ForwardAuthForm initial={INITIAL} />);
    fireEvent.click(screen.getByText(/Validate connection/i));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const call = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes('/api/auth/forward-auth/validate'),
    );
    expect(call).toBeDefined();
  });
});
