import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import {
  JobRetentionResponse,
  BackupRetentionResponse,
  VisibilityRetentionResponse,
  ReleaseRetentionResponse,
  type JobRetention,
  type BackupRetention,
  type VisibilityRetention,
  type ReleaseRetention,
} from '@/api/schemas';

export type HousekeepingSection = 'jobs' | 'backups' | 'visibility' | 'releases';

// Per-section PATCH body shapes (each is PATCH-only on the server).
export interface SectionBody {
  jobs: JobRetention;
  backups: BackupRetention;
  visibility: VisibilityRetention;
  releases: ReleaseRetention;
}

const RESPONSE = {
  jobs: JobRetentionResponse,
  backups: BackupRetentionResponse,
  visibility: VisibilityRetentionResponse,
  releases: ReleaseRetentionResponse,
} as const;

export function useSaveHousekeeping<S extends HousekeepingSection>(section: S) {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SectionBody[S]) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.patch(`/api/settings/housekeeping/${section}`, body);
      return RESPONSE[section].parse(raw);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['housekeeping'] }),
  });
}
