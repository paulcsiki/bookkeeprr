'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EbookHit } from '../types';
import { Cover } from '@/components/Cover';
import { apiFetch } from '@/lib/api-fetch';

type Props = {
  hit: EbookHit;
  onClose: () => void;
  /** "Add into" library group selection — null/omitted means Library root. */
  groupId?: number | null;
};

type QualityProfile = { id: number; name: string };

export function EbookSeriesSheet({ hit, onClose, groupId = null }: Props): React.JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState(hit.title);
  const [author, setAuthor] = useState(hit.author ?? '');
  const [totalVolumes, setTotalVolumes] = useState(3);
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null);

  const profiles = useQuery({
    queryKey: ['quality-profiles'],
    queryFn: async (): Promise<QualityProfile[]> => {
      const r = await apiFetch('/api/quality-profiles');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as QualityProfile[];
    },
  });

  const defaultQpId = profiles.data?.[0]?.id ?? null;
  const effectiveQpId = qualityProfileId ?? defaultQpId;

  const mutation = useMutation({
    mutationFn: async (): Promise<{ id: number }> => {
      if (effectiveQpId === null) throw new Error('Pick a quality profile');
      const r = await apiFetch('/api/series', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contentType: 'ebook',
          flow: 'series',
          olid: hit.olid,
          isbn: hit.isbn,
          author: author.trim().length > 0 ? author.trim() : null,
          title,
          year: hit.firstPublishYear,
          coverUrl: hit.coverUrl,
          description: hit.description,
          totalVolumes,
          qualityProfileId: effectiveQpId,
          monitoring: 'all',
          ...(groupId != null ? { groupId } : {}),
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return (await r.json()) as { id: number };
    },
    onSuccess: (data) => {
      toast.success('Added to library');
      onClose();
      router.push(`/library/${data.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="space-y-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add book series</SheetTitle>
        </SheetHeader>

        <div className="relative mx-auto h-48 w-32 overflow-hidden rounded">
          <Cover
            className="absolute inset-0"
            src={hit.coverUrl}
            contentType="ebook"
            title={title}
            alt=""
            loading="eager"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-title">Series title</Label>
          <Input id="series-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Defaults to the book&apos;s title; edit to match the series name.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="author">Author</Label>
          <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>

        {hit.isbn !== null && (
          <div className="space-y-2">
            <Label>ISBN</Label>
            <Input value={hit.isbn} readOnly className="bg-muted" />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="total-volumes">Number of books</Label>
          <Input
            id="total-volumes"
            type="number"
            min={1}
            max={200}
            value={totalVolumes}
            onChange={(e) => setTotalVolumes(Number(e.target.value))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="qp">Quality profile</Label>
          <Select
            value={effectiveQpId != null ? String(effectiveQpId) : ''}
            onValueChange={(v) => setQualityProfileId(Number(v))}
          >
            <SelectTrigger id="qp">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {profiles.data?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || effectiveQpId === null}
          >
            {mutation.isPending ? 'Saving…' : 'Add'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
