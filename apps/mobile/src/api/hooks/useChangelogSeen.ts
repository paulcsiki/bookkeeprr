import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

interface ChangelogSeenResponse {
  version: string | null;
}

const QUERY_KEY = ['changelogSeen'] as const;

export function useChangelogSeen() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: state.status === 'authenticated',
    queryFn: async (): Promise<string | null> => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const res = await client.get<ChangelogSeenResponse>('/api/mobile/changelog-seen');
      return res.version ?? null;
    },
  });

  const mutation = useMutation({
    mutationFn: async (version: string): Promise<void> => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.post('/api/mobile/changelog-seen', { version });
    },
    onSuccess: (_data, version) => {
      qc.setQueryData<string | null>(QUERY_KEY, version);
    },
  });

  return {
    lastSeen: query.data ?? null,
    isLoading: query.isLoading,
    markSeen: mutation.mutate,
    // Legacy: expose mutate/mutateAsync so existing callers (ChangelogTrigger)
    // can be migrated incrementally without breaking.
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
  };
}
