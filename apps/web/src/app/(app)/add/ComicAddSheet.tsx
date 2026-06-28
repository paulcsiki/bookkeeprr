'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api-fetch';

type ComicSearchHit = {
  comicvineId: number;
  name: string;
  publisher: string | null;
  startYear: number | null;
  issueCount: number | null;
  coverUrl: string | null;
  description: string | null;
};

type QualityProfile = { id: number; name: string };

type Props = {
  hit: ComicSearchHit;
  onClose: () => void;
  /** "Add into" library group selection — null/omitted means Library root. */
  groupId?: number | null;
};

function previewRootPath(hit: ComicSearchHit): string {
  const publisher = hit.publisher ?? '';
  const year = hit.startYear ? ` (${hit.startYear})` : '';
  // Mirrors the comic series_folder default: {publisher}/{series_title} ({series_year})
  return `/media/comics/${publisher ? publisher + '/' : ''}${hit.name}${year}`;
}

export function ComicAddSheet({ hit, onClose, groupId = null }: Props): React.JSX.Element {
  const router = useRouter();
  const [qpId, setQpId] = useState<number | null>(null);

  const { data: profiles } = useQuery<QualityProfile[]>({
    queryKey: ['quality-profiles'],
    queryFn: async (): Promise<QualityProfile[]> => {
      const r = await apiFetch('/api/quality-profiles');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as QualityProfile[];
    },
  });

  const defaultQpId = profiles?.[0]?.id ?? null;
  const effectiveQpId = qpId ?? defaultQpId;

  const addMutation = useMutation({
    mutationFn: async () => {
      if (effectiveQpId === null) throw new Error('no quality profile available');
      const body = {
        contentType: 'comic' as const,
        comicvineId: hit.comicvineId,
        publisher: hit.publisher ?? undefined,
        startYear: hit.startYear ?? undefined,
        titleEnglish: hit.name,
        coverUrl: hit.coverUrl ?? undefined,
        description: hit.description ?? undefined,
        qualityProfileId: effectiveQpId,
        rootPath: previewRootPath(hit),
        ...(groupId != null ? { groupId } : {}),
      };
      const r = await apiFetch('/api/series', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const respBody = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((respBody as { error?: string }).error ?? `HTTP ${r.status}`);
      return respBody as { id: number };
    },
    onSuccess: (data) => {
      toast.success('Added to library');
      onClose();
      router.push(`/library/${data.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="space-y-4">
        <SheetHeader>
          <SheetTitle>{hit.name}</SheetTitle>
        </SheetHeader>
        <div className="text-sm text-muted-foreground">
          {hit.publisher ?? '—'}
          {hit.startYear ? ` · ${hit.startYear}` : ''}
          {hit.issueCount != null ? ` · ${hit.issueCount} issues` : ''}
        </div>
        <div className="space-y-2">
          <Label htmlFor="qp">Quality profile</Label>
          <Select
            value={effectiveQpId != null ? String(effectiveQpId) : ''}
            onValueChange={(v) => setQpId(parseInt(v, 10))}
          >
            <SelectTrigger id="qp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(profiles ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Root path (preview)</Label>
          <code className="block text-xs p-2 bg-muted rounded">{previewRootPath(hit)}</code>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || effectiveQpId === null}
          >
            {addMutation.isPending ? 'Adding…' : 'Add to library'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
