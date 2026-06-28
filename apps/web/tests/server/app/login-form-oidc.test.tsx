/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LoginForm } from '@/app/login/LoginForm';

describe('LoginForm OIDC button', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('hides the OIDC button when /api/auth/oidc/info returns enabled=false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ enabled: false, buttonLabel: 'Sign in with SSO' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(<LoginForm searchParamsPromise={Promise.resolve({})} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText(/Sign in with SSO/i)).toBeNull();
  });

  it('shows the OIDC button + label when enabled', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ enabled: true, buttonLabel: 'Sign in with Authentik' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(<LoginForm searchParamsPromise={Promise.resolve({})} />);
    await waitFor(() => {
      expect(screen.getByText(/Sign in with Authentik/i)).toBeTruthy();
    });
  });
});
