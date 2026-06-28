import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { AuditEventsResponse } from '@/api/schemas';

export type AuditFilter = 'all' | 'writes' | 'logins' | 'errors';

interface Params {
  filter?: AuditFilter;
  cursor?: string;
  action?: string;
}

export function useAuditEvents({ filter = 'all', cursor, action }: Params = {}) {
  const { state, signOut } = useAuth();
  const trimmedAction = action?.trim() ?? '';
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['audit', filter, cursor, trimmedAction],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const qs = new URLSearchParams({ filter });
      if (cursor) qs.set('cursor', cursor);
      if (trimmedAction) qs.set('action', trimmedAction);
      const raw = await client.get(`/api/mobile/audit/events?${qs.toString()}`);
      return AuditEventsResponse.parse(raw);
    },
  });
}
