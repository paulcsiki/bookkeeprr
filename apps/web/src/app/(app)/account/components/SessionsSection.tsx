'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Monitor, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-fetch';

type SessionEntry = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function SessionsSection(): React.JSX.Element {
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const r = await apiFetch('/api/auth/sessions');
      if (!r.ok) throw new Error('Failed to load sessions');
      const body = (await r.json()) as { sessions: SessionEntry[] };
      return body.sessions;
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Failed to revoke session');
      }
    },
    onMutate: (id) => setRevoking(id),
    onSuccess: () => {
      toast.success('Session revoked');
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSettled: () => setRevoking(null),
  });

  return (
    <>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions found.</p>
      ) : (
        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {data.map((s) => (
            <div key={s.id} className="flex items-center gap-4 px-4 py-3">
              <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-foreground">{s.id}</span>
                  {s.current && (
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
                      current
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {s.userAgent ?? 'Unknown device'}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {s.ipAddress ? `${s.ipAddress} · ` : ''}Last seen {fmtDate(s.lastSeenAt)}
                </div>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={revoking === s.id}
                  onClick={() => revoke.mutate(s.id)}
                  aria-label="Revoke session"
                >
                  <Trash2 className="h-3.5 w-3.5 text-[var(--color-err)]" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
