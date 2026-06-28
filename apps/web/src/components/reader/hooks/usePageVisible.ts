'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks document visibility (`true` while the tab/page is foregrounded).
 * Used to gate the reading-stats heartbeat for paged readers, which have no
 * explicit play/pause — "active" is approximated as mounted + visible.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  );
  useEffect(() => {
    const onChange = (): void => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}
