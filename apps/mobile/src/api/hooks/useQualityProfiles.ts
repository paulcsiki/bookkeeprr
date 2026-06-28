import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

export const QualityProfileSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  isDefault: z.boolean().optional(),
});

export type QualityProfile = z.infer<typeof QualityProfileSchema>;

const QualityProfilesResponse = z.array(QualityProfileSchema);

export function useQualityProfiles() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['quality-profiles'],
    queryFn: async (): Promise<QualityProfile[]> => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get('/api/quality-profiles');
      return QualityProfilesResponse.parse(raw);
    },
    staleTime: 5 * 60_000,
  });
}

/** Returns the default profile id (isDefault flag, else first, else undefined). */
export function defaultProfileId(profiles: QualityProfile[] | undefined): number | undefined {
  if (!profiles || profiles.length === 0) return undefined;
  return (profiles.find((p) => p.isDefault) ?? profiles[0])?.id;
}
