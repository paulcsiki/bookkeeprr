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
import type { AudiobookHit } from '../types';
import { Cover } from '@/components/Cover';
import { apiFetch } from '@/lib/api-fetch';

type Props = {
  hit: AudiobookHit;
  onClose: () => void;
  /** "Add into" library group selection — null/omitted means Library root. */
  groupId?: number | null;
};

type QualityProfile = { id: number; name: string };

function formatRuntime(mins: number | null): string {
  if (mins === null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function AudiobookAddSheet({ hit, onClose, groupId = null }: Props): React.JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState(hit.title);
  const [author, setAuthor] = useState(hit.author ?? '');
  const [narrator, setNarrator] = useState(hit.narrator ?? '');

  const profiles = useQuery({
    queryKey: ['quality-profiles'],
    queryFn: async (): Promise<QualityProfile[]> => {
      const r = await apiFetch('/api/quality-profiles');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as QualityProfile[];
    },
  });

  const defaultQpId = profiles.data?.[0]?.id ?? null;
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null);
  const effectiveQpId = qualityProfileId ?? defaultQpId;

  const mutation = useMutation({
    mutationFn: async (): Promise<{ id: number }> => {
      if (effectiveQpId === null) throw new Error('Pick a quality profile');
      const r = await apiFetch('/api/series', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contentType: 'audiobook',
          // Omit when there's no Audible ASIN (iTunes/NYT/LibriVox) — the
          // audiobook is keyed by title instead.
          ...(hit.asin ? { asin: hit.asin } : {}),
          author: author || null,
          narrator: narrator || null,
          title,
          year: hit.releaseYear,
          coverUrl: hit.coverUrl,
          runtimeMinutes: hit.runtimeMinutes,
          description: hit.description,
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
      toast.success('Added');
      router.push(`/library/${data.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const runtime = formatRuntime(hit.runtimeMinutes);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="space-y-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add audiobook</SheetTitle>
        </SheetHeader>

        <div className="relative mx-auto h-48 w-32 overflow-hidden rounded">
          <Cover
            className="absolute inset-0"
            src={hit.coverUrl}
            contentType="audiobook"
            title={title}
            alt=""
            loading="eager"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="author">Author</Label>
          <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="narrator">Narrator</Label>
          <Input id="narrator" value={narrator} onChange={(e) => setNarrator(e.target.value)} />
        </div>

        {hit.asin ? (
          <div className="space-y-2">
            <Label>ASIN</Label>
            <Input value={hit.asin} readOnly className="bg-muted" />
          </div>
        ) : null}

        {runtime && (
          <div className="space-y-2">
            <Label>Runtime</Label>
            <p className="text-sm text-muted-foreground">{runtime}</p>
          </div>
        )}

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
              {(profiles.data ?? []).map((p) => (
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
