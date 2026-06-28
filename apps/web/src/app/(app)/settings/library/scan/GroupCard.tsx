'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ChangeMatchDialog } from './ChangeMatchDialog';
import { FileListDisclosure } from './FileListDisclosure';
import type { GroupSummary } from '@/app/api/scan/groups/route';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Mirror-import preview: the group chain the series dir's PARENT folders will
 * materialize under the target group, or "target group" when the series dir
 * sits at the scan root. Mono + primary — it's a path fact.
 */
function MirrorChain({ relativeDir }: { relativeDir: string }): React.JSX.Element {
  const parents = relativeDir === '' ? [] : relativeDir.split('/').slice(0, -1);
  return (
    <div
      className="flex items-center gap-1.5 font-mono text-xs text-primary"
      data-testid="scan-mirror-chain"
    >
      <Folder size={12} className="shrink-0" aria-hidden />
      <span className="truncate">
        → {parents.length > 0 ? parents.join(' / ') : 'target group'}
      </span>
    </div>
  );
}

export function GroupCard({ group }: { group: GroupSummary }): React.JSX.Element {
  const qc = useQueryClient();
  const [matchOpen, setMatchOpen] = useState(false);

  const confirm = useMutation({
    mutationFn: async (): Promise<{
      seriesId: number;
      importedCount: number;
      skippedCount: number;
    }> => {
      const res = await apiFetch(`/api/scan/groups/${group.dirHash}/confirm`, { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as {
        seriesId: number;
        importedCount: number;
        skippedCount: number;
      };
    },
    onSuccess: (r) => {
      toast.success(
        `Imported ${r.importedCount} file${r.importedCount === 1 ? '' : 's'}` +
          (r.skippedCount ? ` (${r.skippedCount} skipped)` : ''),
      );
      qc.invalidateQueries({ queryKey: ['scan', 'groups'] });
      qc.invalidateQueries({ queryKey: ['series'] });
      qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reject = useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await apiFetch(`/api/scan/groups/${group.dirHash}/reject`, { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Group rejected');
      qc.invalidateQueries({ queryKey: ['scan', 'groups'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canImport = group.proposedAniListId !== null;

  return (
    <div className="flex gap-4 rounded-lg border border-border bg-card p-4">
      <div className="shrink-0">
        {group.proposedCoverUrl ? (
          <Image
            src={group.proposedCoverUrl}
            alt=""
            width={64}
            height={96}
            className="rounded-sm object-cover"
            unoptimized
          />
        ) : (
          <div className="h-24 w-16 rounded-sm bg-muted" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium truncate">{group.proposedTitle ?? group.dirname}</div>
          {group.existingSeriesId !== null ? (
            <Badge variant="secondary">Link to library</Badge>
          ) : group.proposedAniListId !== null ? (
            <Badge variant="default">Will create</Badge>
          ) : (
            <Badge variant="outline">No match</Badge>
          )}
          <Badge variant="outline">{group.inferredGranularity}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {group.directory} · {group.fileCount} files · avg confidence{' '}
          {group.avgConfidence.toFixed(2)}
        </div>
        {group.structure === 'mirror' && <MirrorChain relativeDir={group.relativeDir} />}
        <FileListDisclosure files={group.files} />
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => setMatchOpen(true)}>
            Change match
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost">
                Reject
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reject group?</AlertDialogTitle>
                <AlertDialogDescription>
                  This marks every file in this group as rejected. Re-scans won&apos;t propose them
                  again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => reject.mutate()}>Reject</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            size="sm"
            disabled={!canImport || confirm.isPending}
            onClick={() => confirm.mutate()}
            title={canImport ? undefined : 'Pick a match first via Change match'}
          >
            {confirm.isPending ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
      <ChangeMatchDialog
        dirHash={group.dirHash}
        initialQuery={group.dirname}
        open={matchOpen}
        onClose={() => setMatchOpen(false)}
      />
    </div>
  );
}
