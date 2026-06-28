'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shell/PageHeader';
import { ActivityList } from './ActivityList';
import { AggregateSpeedStrip } from './AggregateSpeedStrip';
import { apiFetch } from '@/lib/api-fetch';

type ActivityRow = {
  id: number;
  status:
    | 'queued'
    | 'downloading'
    | 'completed'
    | 'importing'
    | 'imported'
    | 'failed'
    | 'superseded';
  downloadSpeed?: number | null;
  progress?: number | null;
  sizeBytes?: number | null;
  eta?: number | null;
};

export default function ActivityPage(): React.JSX.Element {
  const { data } = useQuery<{ downloads: ActivityRow[] }>({
    queryKey: ['downloads'],
    queryFn: async () => {
      const r = await apiFetch('/api/downloads');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ downloads: ActivityRow[] }>;
    },
    refetchInterval: 10_000,
  });

  const rows = data?.downloads ?? [];
  const active = rows.filter((r) => r.status === 'downloading' || r.status === 'importing').length;
  const queued = rows.filter((r) => r.status === 'queued').length;
  const hasActive = active > 0 || queued > 0;

  const subtitle =
    active === 0 && queued === 0
      ? 'Recent downloads and import history.'
      : `${active} active · ${queued} queued`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        subtitle={subtitle}
      />
      {hasActive && (
        <AggregateSpeedStrip
          rows={rows}
          activeCount={active}
          queuedCount={queued}
        />
      )}
      <ActivityList />
    </div>
  );
}
