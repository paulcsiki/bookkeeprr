import { vi, describe, it, expect } from 'vitest';

vi.mock('@/server/auth/session-middleware', () => ({ authenticateRequest: vi.fn() }));

import { authenticateRequest } from '@/server/auth/session-middleware';
import { requireUserId } from '@/server/auth/require-user';
import type { NextRequest } from 'next/server';

const mockAuth = vi.mocked(authenticateRequest);
const req = {} as NextRequest;

describe('requireUserId', () => {
  it('returns userId for human actor', async () => {
    mockAuth.mockResolvedValue({
      kind: 'authenticated',
      actor: { userId: 9, role: 'user' },
    });
    expect(await requireUserId(req)).toBe(9);
  });

  it('returns null for system actor', async () => {
    mockAuth.mockResolvedValue({ kind: 'authenticated', actor: 'system' });
    expect(await requireUserId(req)).toBeNull();
  });

  it('returns null when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ kind: 'unauthenticated' });
    expect(await requireUserId(req)).toBeNull();
  });
});
