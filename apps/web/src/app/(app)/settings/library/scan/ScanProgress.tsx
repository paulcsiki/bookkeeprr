'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLocalStorage } from '@/components/hooks/useLocalStorage';
import { apiFetch } from '@/lib/api-fetch';

type JobRow = {
  id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled';
  error: string | null;
};

const TERMINAL_STATUSES: ReadonlyArray<JobRow['status']> = [
  'completed',
  'failed',
  'interrupted',
  'cancelled',
];

export function ScanProgress(): React.JSX.Element | null {
  const [jobId, setJobId] = useLocalStorage<number | null>('scan:jobId', null);
  const qc = useQueryClient();

  const { data } = useQuery<JobRow | null>({
    queryKey: ['scan', 'job', jobId],
    queryFn: async () => {
      if (jobId === null) return null;
      const res = await apiFetch(`/api/jobs/${jobId}`);
      if (!res.ok) return null;
      return (await res.json()) as JobRow;
    },
    enabled: jobId !== null,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (!data) return;
    if (TERMINAL_STATUSES.includes(data.status)) {
      setJobId(null);
      qc.invalidateQueries({ queryKey: ['scan', 'groups'] });
      if (data.status === 'failed' && data.error) {
        toast.error(`Scan failed: ${data.error}`);
      }
    }
  }, [data, setJobId, qc]);

  if (!jobId || !data) return null;
  if (TERMINAL_STATUSES.includes(data.status)) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card p-3 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Scanning…</span>
    </div>
  );
}
