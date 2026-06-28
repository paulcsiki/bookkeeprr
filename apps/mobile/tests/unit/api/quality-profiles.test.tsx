/**
 * Unit tests for useQualityProfiles:
 *   - Verifies correct URL and parse of the response.
 *   - Verifies QualityProfileSchema accepts / rejects shapes.
 *   - Verifies defaultProfileId picks the isDefault-flagged profile, then
 *     falls back to the first, then returns undefined for an empty list.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import {
  useQualityProfiles,
  QualityProfileSchema,
  defaultProfileId,
} from '@/api/hooks/useQualityProfiles';
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

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
};

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('QualityProfileSchema', () => {
  it('accepts a full profile', () => {
    const result = QualityProfileSchema.safeParse({ id: 1, name: 'Default', isDefault: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(1);
      expect(result.data.name).toBe('Default');
      expect(result.data.isDefault).toBe(true);
    }
  });

  it('accepts a profile without isDefault (optional)', () => {
    const result = QualityProfileSchema.safeParse({ id: 2, name: 'HD' });
    expect(result.success).toBe(true);
  });

  it('rejects a profile with id 0 (not positive)', () => {
    const result = QualityProfileSchema.safeParse({ id: 0, name: 'Bad' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// defaultProfileId helper
// ---------------------------------------------------------------------------

describe('defaultProfileId', () => {
  it('returns undefined for undefined input', () => {
    expect(defaultProfileId(undefined)).toBeUndefined();
  });

  it('returns undefined for empty list', () => {
    expect(defaultProfileId([])).toBeUndefined();
  });

  it('returns the isDefault-flagged profile id', () => {
    const profiles = [
      { id: 1, name: 'First' },
      { id: 2, name: 'HD', isDefault: true },
    ];
    expect(defaultProfileId(profiles)).toBe(2);
  });

  it('falls back to first profile when none is flagged default', () => {
    const profiles = [
      { id: 3, name: 'First' },
      { id: 4, name: 'Second' },
    ];
    expect(defaultProfileId(profiles)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// useQualityProfiles URL + parse tests (with MSW)
// ---------------------------------------------------------------------------

describe('useQualityProfiles', () => {
  it('fetches /api/quality-profiles and parses the array', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get('https://srv/api/quality-profiles', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([
          { id: 1, name: 'Default', isDefault: true },
          { id: 2, name: 'High Quality' },
        ]);
      }),
    );

    const { result } = await renderHook(() => useQualityProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedUrl).toContain('/api/quality-profiles');
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0]!.id).toBe(1);
    expect(result.current.data![0]!.name).toBe('Default');
    expect(result.current.data![0]!.isDefault).toBe(true);
    expect(result.current.data![1]!.id).toBe(2);
  });

  it('returns empty array when server returns []', async () => {
    server.use(
      http.get('https://srv/api/quality-profiles', () =>
        HttpResponse.json([]),
      ),
    );

    const { result } = await renderHook(() => useQualityProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('enters error state on server error', async () => {
    server.use(
      http.get('https://srv/api/quality-profiles', () =>
        HttpResponse.json({ error: 'not found' }, { status: 500 }),
      ),
    );

    const { result } = await renderHook(() => useQualityProfiles(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
