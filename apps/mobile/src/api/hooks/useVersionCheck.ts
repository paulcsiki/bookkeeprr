import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { fetchVersion } from '@/api/anon-client';

export function useVersionCheck() {
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : null;
  return useQuery({
    enabled: !!serverUrl,
    queryKey: ['version', serverUrl],
    queryFn: () => fetchVersion(serverUrl as string),
    staleTime: 60_000,
  });
}
