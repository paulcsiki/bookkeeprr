/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateUserForm } from '@/app/(app)/settings/users/CreateUserForm';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('CreateUserForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the create header and a Create button', () => {
    render(<CreateUserForm />);
    expect(screen.getByText('Create user')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
  });

  it('submits POST /api/users with the entered fields and navigates back', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    const { container } = render(<CreateUserForm />);

    fireEvent.change(container.querySelector('#create-username')!, {
      target: { value: 'alice' },
    });
    fireEvent.change(container.querySelector('#create-password')!, {
      target: { value: 'hunter2hunter2' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    const call = (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/api/users',
    );
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string) as {
      username: string;
      password: string;
      role: string;
      mustChangePassword: boolean;
    };
    expect(body.username).toBe('alice');
    expect(body.password).toBe('hunter2hunter2');
    expect(body.role).toBe('user');
    expect(body.mustChangePassword).toBe(true);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/settings/users'));
    // The destination is force-dynamic, so the push itself re-fetches the
    // fresh user list — no redundant router.refresh() should be issued.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces a server error and does not navigate', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    const { toast } = await import('sonner');
    (apiFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Username taken' }), { status: 409 }),
    );

    const { container } = render(<CreateUserForm />);
    fireEvent.change(container.querySelector('#create-username')!, {
      target: { value: 'bob' },
    });
    fireEvent.change(container.querySelector('#create-password')!, {
      target: { value: 'hunter2hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Username taken'));
    expect(push).not.toHaveBeenCalled();
  });
});
