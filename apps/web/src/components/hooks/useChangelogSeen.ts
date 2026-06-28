'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

const KEY = ['changelog-seen'] as const;

type SeenResponse = { version: string | null };

export function useChangelogSeen(): {
  lastSeen: string | null;
  isLoading: boolean;
  markSeen: (v: string) => void;
} {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<SeenResponse> => {
      const r = await apiFetch('/api/updates/changelog-seen');
      if (!r.ok) return { version: null };
      return (await r.json()) as SeenResponse;
    },
    staleTime: 60_000,
  });

  const mark = useMutation({
    mutationFn: async (version: string) => {
      await apiFetch('/api/updates/changelog-seen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version }),
      });
    },
    onSuccess: (_d, version) => {
      qc.setQueryData<SeenResponse>(KEY, { version });
    },
  });

  return {
    lastSeen: query.data?.version ?? null,
    isLoading: query.isLoading,
    markSeen: (v: string) => mark.mutate(v),
  };
}
