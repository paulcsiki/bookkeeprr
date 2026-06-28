import { useQuery } from '@tanstack/react-query';
import type { ContentType } from '@bookkeeprr/types/pure';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { NamingResponse } from '@/api/schemas';

// GET /api/settings/naming?contentType=<ct> → { contentType, templates }.
export function useNamingTemplates(contentType: ContentType) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['naming', contentType],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get(`/api/settings/naming?contentType=${contentType}`);
      return NamingResponse.parse(raw);
    },
  });
}
