import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContentType } from '@bookkeeprr/types/pure';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { NamingTemplates } from '@/api/schemas';

// PUT /api/settings/naming?contentType=<ct> with { templates } → { ok: true }.
// Invalidates ['naming', ct] so the form re-baselines from the server.
export function useSaveNaming(contentType: ContentType) {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templates: NamingTemplates) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return client.put(`/api/settings/naming?contentType=${contentType}`, { templates });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['naming', contentType] }),
  });
}
