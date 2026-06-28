import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useAuth, type AuthState } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { LogTail } from '@/api/schemas';

interface Options {
  /** When true, refetch every 3s (Live mode). */
  live?: boolean;
}

/** Query key for a log page. `before == null` is the live tail (newest page). */
export function logTailKey(name: string, before: number | null) {
  return ['log-tail', name, before] as const;
}

async function fetchLogPage(
  state: AuthState,
  signOut: () => void,
  name: string,
  before: number | null,
): Promise<LogTail> {
  if (state.status !== 'authenticated') throw new Error('unauthenticated');
  const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
  const beforeQs = before != null ? `&before=${before}` : '';
  const path = `/api/audit/logs/files/${encodeURIComponent(name)}?limit=500${beforeQs}`;
  return LogTail.parse(await client.get(path));
}

/**
 * The live tail of a log file. ALWAYS targets the newest page (`before: null`)
 * so that Live polling and Refresh follow newly appended lines regardless of
 * how far back the viewer has paged. Older pages are fetched out-of-band via
 * {@link useLogPageFetcher}, keeping this query's key stable.
 */
export function useLogTail(name: string, opts: Options = {}) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated' && !!name,
    queryKey: logTailKey(name, null),
    ...(opts.live ? { refetchInterval: 3000 } : {}),
    queryFn: () => fetchLogPage(state, signOut, name, null),
  });
}

/**
 * Returns a function that fetches (and caches) an older log page by cursor,
 * without disturbing the live-tail query. Used by "Load earlier".
 */
export function useLogPageFetcher(qc: QueryClient) {
  const { state, signOut } = useAuth();
  return (name: string, before: number): Promise<LogTail> =>
    qc.fetchQuery({
      queryKey: logTailKey(name, before),
      queryFn: () => fetchLogPage(state, signOut, name, before),
    });
}
