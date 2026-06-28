'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { SearchHit } from '@/server/integrations/anilist/schemas';
import { Cover } from '@/components/Cover';
import { apiFetch } from '@/lib/api-fetch';

type Props = {
  dirHash: string;
  initialQuery: string;
  open: boolean;
  onClose: () => void;
};

export function ChangeMatchDialog({
  dirHash,
  initialQuery,
  open,
  onClose,
}: Props): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const qc = useQueryClient();
  const search = useQuery<SearchHit[]>({
    queryKey: ['anilist', 'search', query],
    queryFn: async () => {
      if (query.trim().length < 2) return [];
      const res = await apiFetch('/api/series/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { hits: SearchHit[] };
      return body.hits;
    },
    enabled: open && query.trim().length >= 2,
  });

  const apply = useMutation({
    mutationFn: async (anilistId: number): Promise<void> => {
      const res = await apiFetch(`/api/scan/groups/${dirHash}/match`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ anilistId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Match updated');
      qc.invalidateQueries({ queryKey: ['scan', 'groups'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change match</DialogTitle>
          <DialogDescription>
            Search AniList for the correct series. The match applies to every file in this group.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search AniList…"
        />
        <div className="max-h-80 overflow-y-auto space-y-1">
          {search.data?.map((hit) => (
            <button
              key={hit.anilistId}
              type="button"
              onClick={() => apply.mutate(hit.anilistId)}
              disabled={apply.isPending}
              className="flex w-full items-start gap-3 rounded-md border border-border p-2 text-left hover:bg-accent"
            >
              <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-sm">
                <Cover
                  className="absolute inset-0"
                  src={hit.coverUrl}
                  contentType="manga"
                  title={hit.titleRomaji ?? hit.titleEnglish ?? hit.titleNative ?? ''}
                  alt=""
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {hit.titleRomaji ?? hit.titleEnglish ?? hit.titleNative ?? '?'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {hit.startYear ?? '?'} · {hit.format ?? '?'} · {hit.status}
                </div>
              </div>
            </button>
          ))}
          {search.isFetching && <div className="text-xs text-muted-foreground">Searching…</div>}
          {!search.isFetching && (search.data?.length ?? 0) === 0 && query.trim().length >= 2 && (
            <div className="text-xs text-muted-foreground">No results.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
