import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { keyResponse, KeyTestResult } from '@/api/schemas';

/**
 * Read a single-secret setting from `getPath`. The route returns its object
 * directly (`{ [field]: string }`) with the value masked to `'****'` when set
 * and `''` when unset. Keyed by the GET path so each concrete screen gets its
 * own cache entry.
 */
export function useKeySetting(getPath: string, field: string) {
  const { state, signOut } = useAuth();
  const schema = keyResponse(field);
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['key-setting', getPath],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return schema.parse(await client.get(getPath));
    },
  });
}

/**
 * Save a single-secret setting. PUTs `{ [field]: value }` to `putPath`; a blank
 * value tells the server to keep the stored secret. Invalidates the matching
 * `useKeySetting(getPath)` query on success.
 */
export function useSaveKeySetting(getPath: string, putPath: string, field: string) {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: string) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return client.put(putPath, { [field]: value });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['key-setting', getPath] }),
  });
}

/**
 * Test a key/connection. POSTs `{ [field]: value || undefined }` to `testPath`
 * and resolves to `{ ok, error? }`. Mirrors `useTestOidc`: a non-2xx body that
 * still carries an `{ ok: false }` result is mapped back to a resolved value
 * rather than thrown.
 */
export function useTestKey(testPath: string, field: string) {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async (value: string) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      try {
        return KeyTestResult.parse(await client.post(testPath, { [field]: value || undefined }));
      } catch (e) {
        if (e instanceof ApiError) {
          const r = KeyTestResult.safeParse(e.body);
          if (r.success) return r.data;
        }
        throw e;
      }
    },
  });
}
