// `usePushState` — react-query-backed view of the local push opt-in flag.
//
// The hook is intentionally thin: it surfaces the persisted `pushSettings`
// blob via react-query so the UI can react to changes immediately after
// `PushService.enable()`/`disable()` invalidates the `PUSH_STATE_QUERY_KEY`.

import { useQuery } from '@tanstack/react-query';
import { pushSettings, type PushSettings } from '@/lib/pushSettings';

export const PUSH_STATE_QUERY_KEY = ['push-state'] as const;

export function usePushState() {
  return useQuery<PushSettings>({
    queryKey: [...PUSH_STATE_QUERY_KEY],
    queryFn: () => pushSettings.get(),
    staleTime: 0,
  });
}
