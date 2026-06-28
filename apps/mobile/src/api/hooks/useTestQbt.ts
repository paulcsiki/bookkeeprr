import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { QbtTestResult } from '@/api/schemas';

interface TestQbtVars {
  host: string;
  port: number;
  username: string;
  password?: string;
  useHttps: boolean;
}

export function useTestQbt() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async (vars: TestQbtVars) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // The route returns 502 on connection failure → ApiError; map to a parsed result.
      try {
        return QbtTestResult.parse(await client.post('/api/qbt/test-connection', vars));
      } catch (e) {
        if (e instanceof ApiError) {
          const r = QbtTestResult.safeParse(e.body);
          if (r.success) return r.data;
        }
        throw e;
      }
    },
  });
}
