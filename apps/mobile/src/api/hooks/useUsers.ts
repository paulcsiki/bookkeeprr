import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { UsersResponse } from '@/api/schemas';

export function useUsers() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['users'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get('/api/users');
      return UsersResponse.parse(raw);
    },
  });
}
