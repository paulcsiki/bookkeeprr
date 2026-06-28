'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api-fetch';
import type { SeriesRow, BookSeriesRow } from '@/server/db/schema';
import type { BookSeriesSummary } from '@bookkeeprr/types';

type Props = {
  series: SeriesRow;
  /** Initial book series membership (if any) — seeded from the server page.
   *  The component tracks the live state locally after mutations. */
  initialBookSeries?: (BookSeriesRow & { memberCount: number }) | null;
};

type BookSeriesListResponse = { bookSeries: BookSeriesSummary[] };

const NONE_VALUE = '__none__';
const CREATE_VALUE = '__create__';

export function SeriesMembershipControl({
  series,
  initialBookSeries = null,
}: Props): React.JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();

  // Local state: which book series this title belongs to (nullable).
  // Seeded from the SSR prop, then kept in sync by mutations.
  const [currentBookSeriesId, setCurrentBookSeriesId] = useState<number | null>(
    initialBookSeries?.id ?? null,
  );
  const [position, setPosition] = useState<string>(
    initialBookSeries != null ? '' : '',
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');

  const { data, isLoading } = useQuery<BookSeriesListResponse>({
    queryKey: ['book-series', series.contentType],
    queryFn: async () => {
      const r = await apiFetch(`/api/book-series?contentType=${series.contentType}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as BookSeriesListResponse;
    },
    staleTime: 30_000,
  });

  const assignMutation = useMutation({
    mutationFn: async ({
      bookSeriesId,
      pos,
    }: {
      bookSeriesId: number;
      pos: number | null;
    }) => {
      const r = await apiFetch(`/api/book-series/${bookSeriesId}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seriesId: series.id, position: pos }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return bookSeriesId;
    },
    onSuccess: (bookSeriesId) => {
      toast.success('Added to series');
      setCurrentBookSeriesId(bookSeriesId);
      void qc.invalidateQueries({ queryKey: ['book-series'] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (bookSeriesId: number) => {
      const r = await apiFetch(
        `/api/book-series/${bookSeriesId}/members/${series.id}`,
        { method: 'DELETE' },
      );
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Removed from series');
      setCurrentBookSeriesId(null);
      setPosition('');
      void qc.invalidateQueries({ queryKey: ['book-series'] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: async (name: string): Promise<BookSeriesSummary> => {
      const r = await apiFetch('/api/book-series', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, contentType: series.contentType }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return (await r.json()) as BookSeriesSummary;
    },
    onSuccess: (created) => {
      setCreateOpen(false);
      setNewSeriesName('');
      void qc.invalidateQueries({ queryKey: ['book-series'] });
      // Immediately assign this title to the newly-created series.
      const pos = position.trim() ? Number(position.trim()) : null;
      assignMutation.mutate({ bookSeriesId: created.id, pos });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSelectChange(value: string) {
    if (value === NONE_VALUE) return;
    if (value === CREATE_VALUE) {
      setCreateOpen(true);
      return;
    }
    const id = Number(value);
    const pos = position.trim() ? Number(position.trim()) : null;
    assignMutation.mutate({ bookSeriesId: id, pos });
  }

  const isBusy =
    isLoading ||
    assignMutation.isPending ||
    removeMutation.isPending ||
    createMutation.isPending;

  return (
    <div data-testid="series-membership-control" className="space-y-2">
      <Label>Book series</Label>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Select
            value={currentBookSeriesId != null ? String(currentBookSeriesId) : NONE_VALUE}
            onValueChange={handleSelectChange}
            disabled={isBusy}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>None</SelectItem>
              {data?.bookSeries.map((bs) => (
                <SelectItem key={bs.id} value={String(bs.id)}>
                  {bs.name}
                  <span className="font-mono text-[11px] text-muted-foreground ml-1">
                    ({bs.memberCount})
                  </span>
                </SelectItem>
              ))}
              <SelectItem value={CREATE_VALUE}>Create new series…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-24">
          <Label className="text-xs text-muted-foreground">Position</Label>
          <Input
            type="number"
            min={1}
            placeholder="–"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={isBusy}
            className="font-mono"
          />
        </div>
      </div>

      {currentBookSeriesId != null && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={() => removeMutation.mutate(currentBookSeriesId)}
        >
          {removeMutation.isPending ? 'Removing…' : 'Remove from series'}
        </Button>
      )}

      {/* Create new series dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create book series</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-series-name">Series name</Label>
              <Input
                id="new-series-name"
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
                placeholder="e.g. His Dark Materials"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setCreateOpen(false);
                  setNewSeriesName('');
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={newSeriesName.trim().length === 0 || createMutation.isPending}
                onClick={() => createMutation.mutate(newSeriesName.trim())}
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
