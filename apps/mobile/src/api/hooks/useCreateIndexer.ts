import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { CreateIndexerResponse, type CreateIndexerBody } from '@/api/schemas';

export function useCreateIndexer() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateIndexerBody) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return CreateIndexerResponse.parse(await client.post('/api/indexers', body));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['indexers'] });
    },
  });
}
