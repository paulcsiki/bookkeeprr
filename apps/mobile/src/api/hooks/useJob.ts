import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { JobStatus } from '@/api/schemas/library';

const ACTIVE_STATUSES = new Set(['pending', 'running']);

export function useJob(jobId: number | null) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated' && jobId != null,
    queryKey: ['job', jobId],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      if (jobId == null) throw new Error('no jobId');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return JobStatus.parse(await client.get(`/api/jobs/${jobId}`));
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && ACTIVE_STATUSES.has(data.status)) return 2000;
      return false;
    },
  });
}
