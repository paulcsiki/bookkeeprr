import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { TorznabCaps } from '@/api/schemas';

interface TorznabCapsVars {
  url: string;
  apiKey: string;
  // When editing an existing indexer the apiKey is masked (blank); pass the row
  // id so the server falls back to the stored key.
  indexerId?: number;
}

export function useTorznabCaps() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async (vars: TorznabCapsVars) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return TorznabCaps.parse(await client.post('/api/indexers/torznab/caps', vars));
    },
  });
}
