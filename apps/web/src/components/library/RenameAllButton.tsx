'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, FolderTree, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-fetch';
import type { LibraryRenamePreview } from '@/app/api/library/rename-all/route';

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

/**
 * Library-wide "Rename all" action with a preview-first flow.
 *
 * Opening the dialog runs a server-side dry-run (GET /api/library/rename-all)
 * that reuses the per-series `computeRenamePlan` to gather every planned folder
 * and file move — nothing is written to disk. The user reviews the grouped list
 * and only then confirms, which POSTs to enqueue the background job.
 */
export function RenameAllButton(): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const preview = useQuery({
    queryKey: ['library-rename-preview'],
    enabled: open,
    // Always rebuild a fresh preview when the dialog opens.
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<LibraryRenamePreview> => {
      const r = await apiFetch('/api/library/rename-all');
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<LibraryRenamePreview>;
    },
  });

  const start = useMutation({
    mutationFn: async (): Promise<void> => {
      const r = await apiFetch('/api/library/rename-all', { method: 'POST' });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Rename started', {
        description: 'Re-applying naming to every series — track it in Activity.',
      });
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const data = preview.data;
  const nothingToDo = data != null && data.totalChanges === 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderTree className="h-3.5 w-3.5" />
        Rename all
      </Button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Description className="sr-only">
              Preview the naming-template renames that will be applied across every series, then
              apply them.
            </DialogPrimitive.Description>

            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <FolderTree className="h-4 w-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="font-display text-lg font-semibold leading-tight text-foreground">
                  Rename all
                </DialogPrimitive.Title>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {preview.isPending
                    ? 'Building a preview — nothing has been changed yet.'
                    : nothingToDo
                      ? 'Re-apply the naming templates to every series on disk.'
                      : `${data?.totalChanges} change${data?.totalChanges === 1 ? '' : 's'} across ${data?.seriesChanged} series — nothing applied yet.`}
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
              {preview.isPending ? (
                <div className="grid min-h-[160px] place-items-center px-6 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    <p className="text-sm">Building preview…</p>
                  </div>
                </div>
              ) : preview.isError ? (
                <div className="grid min-h-[160px] place-items-center px-6 text-center">
                  <p className="text-sm text-err">
                    {preview.error instanceof Error
                      ? preview.error.message
                      : 'Failed to build preview'}
                  </p>
                </div>
              ) : nothingToDo ? (
                <div className="grid min-h-[160px] place-items-center px-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Everything is already organized.
                  </p>
                </div>
              ) : (
                data != null && (
                  <div className="max-h-[60vh] space-y-5 overflow-auto">
                    {data.series.map((s) => (
                      <div key={s.seriesId} className="space-y-2">
                        <p className="truncate font-display text-sm font-semibold text-foreground">
                          {s.title}
                        </p>

                        {s.folder.changed && (
                          <div className="space-y-1.5">
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              Folder
                            </p>
                            <div className="rounded-lg border border-border bg-elevated px-4 py-3">
                              <DiffRow current={s.folder.current} proposed={s.folder.proposed} />
                            </div>
                          </div>
                        )}

                        {s.files.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              Files ({s.files.length})
                            </p>
                            <div className="overflow-hidden rounded-lg border border-border bg-elevated">
                              {s.files.map((f, i) => (
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
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={start.isPending}
              >
                Cancel
              </Button>
              {!preview.isPending && !preview.isError && (
                <Button
                  size="sm"
                  onClick={() => start.mutate()}
                  disabled={nothingToDo || start.isPending}
                >
                  {start.isPending ? 'Starting…' : 'Rename all'}
                </Button>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
