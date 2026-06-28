import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { CalendarResponse } from '@/api/schemas';
import { monthGridRange } from '@/lib/calendar';

/**
 * Fetch + validate the release-calendar entries covering the full 42-cell
 * grid of `month` (`YYYY-MM`). Month-keyed so prev/next navigation caches per
 * month.
 */
export function useCalendar(month: string) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['calendar', month],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const { from, to } = monthGridRange(month);
      const raw = await client.get(`/api/calendar?from=${from}&to=${to}`);
      return CalendarResponse.parse(raw);
    },
  });
}
