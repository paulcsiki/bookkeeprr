// Bridges the connectivity store into TanStack Query's `onlineManager`. When the
// derived online value flips, queries pause/resume accordingly and (with
// `refetchOnReconnect`) refetch on the way back. Extracted from App.tsx so the
// wiring stays a unit-testable pure side-effect rather than living inside JSX.

import { onlineManager } from '@tanstack/react-query';
import { deriveIsOnline, useConnectivity } from './connectivityStore';

/**
 * Seed `onlineManager` from the current store state, then keep it in sync with
 * every store change. Returns the unsubscribe (call once on teardown).
 */
export function wireOnlineManager(): () => void {
  onlineManager.setOnline(deriveIsOnline(useConnectivity.getState()));
  return useConnectivity.subscribe((s) => onlineManager.setOnline(deriveIsOnline(s)));
}
