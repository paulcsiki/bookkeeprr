import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { UserProfileResponse } from '@/api/schemas';

/** Fetch + validate a household member's profile dossier (lifetime stats,
 *  in-progress + finished titles, recent activity). */
export function useUserProfile(userId: number) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated' && Number.isInteger(userId) && userId > 0,
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get(`/api/profile/${userId}`);
      return UserProfileResponse.parse(raw);
    },
  });
}
