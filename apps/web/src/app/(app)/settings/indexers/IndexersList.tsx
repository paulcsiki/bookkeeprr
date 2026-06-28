'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SettingsSection } from '@/components/shell/SettingsSection';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ProwlarrCard } from './ProwlarrCard';
import { apiFetch } from '@/lib/api-fetch';

export type IndexerView = {
  id: number;
  kind: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  configJson: string;
  lastRssAt: string | null;
};

type Props = { initial: IndexerView[]; prowlarrUrl: string; prowlarrHasKey: boolean };

function pollMinutes(configJson: string): number {
  try {
    const v = JSON.parse(configJson) as { pollIntervalSeconds?: unknown };
    if (typeof v.pollIntervalSeconds === 'number') {
      return Math.round(v.pollIntervalSeconds / 60);
    }
  } catch {
    // ignore
  }
  return 15;
}

export function IndexersList({ initial, prowlarrUrl, prowlarrHasKey }: Props): React.JSX.Element {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['indexers'],
    queryFn: async () => {
      const r = await apiFetch('/api/indexers');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { indexers: IndexerView[] };
      return body.indexers;
    },
    initialData: initial,
  });
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const r = await apiFetch(`/api/indexers/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['indexers'] });
      toast.success('Indexer updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleDelete(id: number): void {
    void apiFetch(`/api/indexers/${id}`, { method: 'DELETE' }).then((r) => {
      if (r.ok) {
        void qc.invalidateQueries({ queryKey: ['indexers'] });
        toast.success('Indexer deleted');
      } else {
        toast.error(`Delete failed (${r.status})`);
      }
    });
  }

  return (
    <div className="space-y-7">
      <ProwlarrCard initialUrl={prowlarrUrl} hasKey={prowlarrHasKey} />

      <SettingsSection
        name="Indexers"
        description="Torznab/Newznab sources bookkeeprr polls for releases. Add, enable, and configure each indexer's query template and content types."
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button asChild>
              <Link href="/settings/indexers/new">Add indexer</Link>
            </Button>
          </div>

          {data.length === 0 ? (
            <p className="text-muted-foreground text-sm">No indexers configured.</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {data.map((ix) => {
                const cfg = (() => {
                  try {
                    const obj = JSON.parse(ix.configJson) as Record<string, unknown>;
                    return {
                      kind: (obj.kind as string) ?? ix.kind,
                      queryTemplate: (obj.queryTemplate as string) ?? '?',
                      contentTypes: (obj.contentTypes as string[]) ?? [],
                      viaProwlarr:
                        ((obj.kind as string) ?? ix.kind) === 'torznab' &&
                        typeof obj.prowlarrIndexerId === 'number',
                    };
                  } catch {
                    return {
                      kind: ix.kind,
                      queryTemplate: '?',
                      contentTypes: [],
                      viaProwlarr: false,
                    };
                  }
                })();
                return (
                  <div
                    key={ix.id}
                    className="flex items-center justify-between gap-4 px-4 py-3.5"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{ix.name}</span>
                        {cfg.viaProwlarr && (
                          <Badge variant="outline" className="text-muted-foreground">
                            via Prowlarr
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">
                        {ix.baseUrl} · template: <code className="font-mono">{cfg.queryTemplate}</code>
                        {cfg.contentTypes.length > 0 && (
                          <> · types: {cfg.contentTypes.join(', ')}</>
                        )}
                        {' · '}Poll every {pollMinutes(ix.configJson)} min
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last polled: {ix.lastRssAt ? new Date(ix.lastRssAt).toLocaleString() : '—'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {ix.enabled ? (
                        <Badge>Enabled</Badge>
                      ) : (
                        <Badge variant="outline">Disabled</Badge>
                      )}
                      <Switch
                        checked={ix.enabled}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: ix.id, enabled: v })}
                      />
                      <Button variant="outline" asChild>
                        <Link href={`/settings/indexers/${ix.id}`}>Edit</Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete indexer?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Delete the &quot;{ix.name}&quot; indexer? This also removes its
                              releases. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(ix.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
