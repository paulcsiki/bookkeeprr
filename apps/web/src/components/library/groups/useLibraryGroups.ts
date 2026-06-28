'use client';

// Consumers: AddDialog 'Add into', series-detail Group row, scan form (SP2 Tasks 5-6).
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { GroupNode } from './lib';

interface UseLibraryGroupsResult {
  groups: GroupNode[];
  loading: boolean;
  refresh: () => void;
}

export function useLibraryGroups(): UseLibraryGroupsResult {
  const [groups, setGroups] = useState<GroupNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch('/api/library/groups')
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { groups: GroupNode[] };
        if (!cancelled) setGroups(body.groups);
      })
      .catch(() => {
        // Network error — leave the existing groups in place.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { groups, loading, refresh };
}
