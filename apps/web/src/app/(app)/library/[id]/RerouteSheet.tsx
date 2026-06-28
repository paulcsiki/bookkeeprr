'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { SeriesRow } from '@/server/db/schema';
import { apiFetch } from '@/lib/api-fetch';

type Props = {
  libraryFileId: number;
  currentPath: string;
  onClose: () => void;
  onSuccess: () => void;
};

type SeriesHit = Pick<SeriesRow, 'id' | 'titleEnglish' | 'contentType'>;

export function RerouteSheet({
  libraryFileId,
  currentPath,
  onClose,
  onSuccess,
}: Props): React.JSX.Element {
  const [q, setQ] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<SeriesHit | null>(null);
  const [kind, setKind] = useState<'volume' | 'chapter'>('volume');
  const [number, setNumber] = useState<string>('1');

  const seriesList = useQuery({
    queryKey: ['series', 'all-for-reroute'],
    queryFn: async (): Promise<SeriesHit[]> => {
      const r = await apiFetch('/api/series?page=1&limit=100');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { rows: SeriesHit[] };
      return body.rows;
    },
  });

  const filtered = (seriesList.data ?? []).filter(
    (s) => q.length === 0 || (s.titleEnglish ?? '').toLowerCase().includes(q.toLowerCase()),
  );

  const mutation = useMutation({
    mutationFn: async (): Promise<{ newPath: string }> => {
      if (!selectedSeries) throw new Error('Pick a destination series');
      const body: Record<string, unknown> = { seriesId: selectedSeries.id };
      if (kind === 'volume') {
        const n = Number(number);
        if (!Number.isFinite(n) || n < 1) throw new Error('Volume must be a positive integer');
        body.volumeNumber = n;
      } else {
        if (number.trim() === '') throw new Error('Chapter number required');
        body.chapterNumber = number.trim();
      }
      const r = await apiFetch(`/api/library-files/${libraryFileId}/reroute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${r.status}`);
      }
      return (await r.json()) as { newPath: string };
    },
    onSuccess: (data) => {
      toast.success(`Moved to ${data.newPath}`);
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="space-y-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Re-route file</SheetTitle>
        </SheetHeader>

        <div className="space-y-1">
          <Label>Current path</Label>
          <p className="text-xs text-muted-foreground break-all">{currentPath}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="search">Destination series</Label>
          <Input
            id="search"
            placeholder="Type to filter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto border rounded">
            {filtered.slice(0, 20).map((s) => (
              <button
                key={s.id}
                type="button"
                className={`block w-full text-left px-2 py-1 hover:bg-muted ${selectedSeries?.id === s.id ? 'bg-muted' : ''}`}
                onClick={() => setSelectedSeries(s)}
              >
                <span className="text-sm">{s.titleEnglish ?? '(no title)'}</span>
                <span className="text-xs text-muted-foreground ml-2">[{s.contentType}]</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">No series.</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Target type</Label>
          <RadioGroup
            value={kind}
            onValueChange={(v) => setKind(v as 'volume' | 'chapter')}
            className="flex gap-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="volume" id="kind-volume" />
              Volume
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="chapter" id="kind-chapter" />
              Chapter
            </label>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="number">{kind === 'volume' ? 'Volume number' : 'Chapter number'}</Label>
          <Input
            id="number"
            type={kind === 'volume' ? 'number' : 'text'}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !selectedSeries}
          >
            {mutation.isPending ? 'Moving…' : 'Confirm'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
