'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowRight, FolderTree } from 'lucide-react';
import { toast } from 'sonner';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-fetch';

type RenameItem = {
  libraryFileId: number;
  currentPath: string;
  proposedPath: string;
};

type RenamePlan = {
  seriesId: number;
  folder: { current: string; proposed: string; changed: boolean };
  files: RenameItem[];
};

type ApplyResult = {
  renamed: number;
  errors: { libraryFileId: number; message: string }[];
};

type Props = {
  seriesId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/** current → proposed, basenames emphasized, full paths on hover (mono). */
function DiffRow({ current, proposed }: { current: string; proposed: string }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 font-mono text-[13px]">
      <span className="truncate text-muted-foreground" title={current}>
        {basename(current)}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate text-foreground" title={proposed}>
        {basename(proposed)}
      </span>
    </div>
  );
}

export function RenameDialog({ seriesId, open, onOpenChange }: Props): React.JSX.Element {
  const router = useRouter();

  const plan = useQuery({
    queryKey: ['series-rename-plan', seriesId],
    enabled: open,
    queryFn: async (): Promise<RenamePlan> => {
      const r = await apiFetch(`/api/series/${seriesId}/rename`);
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<RenamePlan>;
    },
  });

  const apply = useMutation({
    mutationFn: async (): Promise<ApplyResult> => {
      const r = await apiFetch(`/api/series/${seriesId}/rename`, { method: 'POST' });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<ApplyResult>;
    },
    onSuccess: (result) => {
      toast.success(`Renamed ${result.renamed} file${result.renamed === 1 ? '' : '(s)'}`);
      if (result.errors.length > 0) {
        toast.warning(
          `${result.errors.length} file${result.errors.length === 1 ? '' : 's'} could not be renamed`,
        );
      }
      // Paths are server-rendered into the page — refresh to reflect the moves.
      router.refresh();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const data = plan.data;
  // No-op when the folder rename is a no-op AND every file's before === after.
  // (The server already filters unchanged files, but compare defensively.)
  const nothingToDo =
    data != null &&
    data.folder.changed === false &&
    data.files.every((f) => f.currentPath === f.proposedPath);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <DialogPrimitive.Description className="sr-only">
            Preview and apply naming-template renames for this series&apos; files and folder.
          </DialogPrimitive.Description>

          {/* Header */}
          <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <FolderTree className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="font-display text-lg font-semibold leading-tight text-foreground">
                Organize
              </DialogPrimitive.Title>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Re-apply the naming templates to this series&apos; files and folder on disk.
              </p>
            </div>
            <DialogPrimitive.Close className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span aria-hidden className="text-lg leading-none">
                ✕
              </span>
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {plan.isPending ? (
              <div className="grid min-h-[160px] place-items-center px-6 text-center">
                <p className="text-sm text-muted-foreground">Computing rename plan…</p>
              </div>
            ) : plan.isError ? (
              <div className="grid min-h-[160px] place-items-center px-6 text-center">
                <p className="text-sm text-err">
                  {plan.error instanceof Error ? plan.error.message : 'Failed to load plan'}
                </p>
              </div>
            ) : nothingToDo ? (
              <div className="grid min-h-[160px] place-items-center px-6 text-center">
                <p className="text-sm font-medium text-foreground">
                  Already organized — nothing to rename.
                </p>
              </div>
            ) : (
              data != null && (
                <div className="space-y-5">
                  {data.folder.changed && (
                    <div className="space-y-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Folder
                      </p>
                      <div className="rounded-lg border border-border bg-elevated px-4 py-3">
                        <DiffRow current={data.folder.current} proposed={data.folder.proposed} />
                      </div>
                    </div>
                  )}

                  {data.files.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Files ({data.files.length})
                      </p>
                      <div className="overflow-hidden rounded-lg border border-border bg-elevated">
                        {data.files.map((f, i) => (
                          <div
                            key={f.libraryFileId}
                            className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                          >
                            <DiffRow current={f.currentPath} proposed={f.proposedPath} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {data != null && !nothingToDo && (
              <Button size="sm" onClick={() => apply.mutate()} disabled={apply.isPending}>
                {apply.isPending ? 'Renaming…' : 'Rename'}
              </Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
