'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api-fetch';

type LightNovelSearchHit = {
  // null for NovelUpdates-only novels (carried via novelUpdatesSlug instead).
  anilistId: number | null;
  novelUpdatesSlug?: string | null;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  coverUrl: string | null;
  status: 'releasing' | 'finished' | 'hiatus' | 'cancelled';
  format: string | null;
  startYear: number | null;
  author?: string | null;
};

type QualityProfile = { id: number; name: string };

type Props = {
  hit: LightNovelSearchHit;
  onClose: () => void;
  /** "Add into" library group selection — null/omitted means Library root. */
  groupId?: number | null;
};

function novelTitle(hit: LightNovelSearchHit): string {
  return (
    hit.titleEnglish ??
    hit.titleRomaji ??
    (hit.anilistId != null
      ? `AniList #${hit.anilistId}`
      : hit.novelUpdatesSlug
        ? `NU ${hit.novelUpdatesSlug}`
        : 'Light Novel')
  );
}

function previewRootPath(hit: LightNovelSearchHit, author: string): string {
  const title = novelTitle(hit);
  const authorPart = author.trim().length > 0 ? `${author}/` : '';
  return `/media/books/${authorPart}${title} Light Novel`;
}

export function LightNovelAddSheet({ hit, onClose, groupId = null }: Props): React.JSX.Element {
  const router = useRouter();
  const [author, setAuthor] = useState(hit.author ?? '');
  const [qpId, setQpId] = useState<number | null>(null);
  const [nuSlug, setNuSlug] = useState(hit.novelUpdatesSlug ?? '');
  const nuSlugValid = nuSlug === '' || /^[a-z0-9-]+$/.test(nuSlug);
  // An NU-only result (no AniList id) is identified solely by its slug, so the
  // slug field can't be left empty — the server would 400 ("requires anilistId
  // or novelUpdatesSlug"). AniList-anchored adds may leave it blank.
  const nuOnly = hit.anilistId == null;
  const nuSlugMissing = nuOnly && nuSlug.trim().length === 0;
  const [nuResolveState, setNuResolveState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'matched'; slug: string; candidateTitle: string }
    | { kind: 'no-match' }
  >({ kind: 'idle' });

  useEffect(() => {
    if (!hit) return;
    // NU-only adds already carry a slug — nothing to resolve from AniList.
    if (hit.anilistId == null) return;
    let cancelled = false;
    const primary = hit.titleEnglish ?? hit.titleRomaji ?? hit.titleNative ?? '';
    if (!primary) return;
    const altTitles = [hit.titleEnglish, hit.titleRomaji, hit.titleNative]
      .filter((t): t is string => t !== null && t !== '')
      .filter((t) => t !== primary);

    setNuResolveState({ kind: 'loading' });
    apiFetch('/api/integrations/novelupdates/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: primary, altTitles }),
    })
      .then((r) => r.json())
      .then((body: { match: 'high'; slug: string; candidateTitle: string } | { match: 'none' }) => {
        if (cancelled) return;
        if (body.match === 'high') {
          setNuResolveState({
            kind: 'matched',
            slug: body.slug,
            candidateTitle: body.candidateTitle,
          });
          // Only auto-fill if the user hasn't typed something already.
          setNuSlug((current) => (current === '' ? body.slug : current));
        } else {
          setNuResolveState({ kind: 'no-match' });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setNuResolveState({ kind: 'no-match' });
      });

    return () => {
      cancelled = true;
    };
  }, [hit]);

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

  const rootPath = previewRootPath(hit, author);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (effectiveQpId === null) throw new Error('no quality profile available');
      const body: Record<string, unknown> = {
        contentType: 'light_novel',
        titleEnglish: hit.titleEnglish ?? novelTitle(hit),
        qualityProfileId: effectiveQpId,
        rootPath,
        ...(groupId != null ? { groupId } : {}),
      };
      // AniList-anchored adds send anilistId; NU-only adds send just the slug.
      if (hit.anilistId != null) body.anilistId = hit.anilistId;
      if (hit.titleRomaji) body.titleRomaji = hit.titleRomaji;
      if (hit.titleNative) body.titleNative = hit.titleNative;
      if (hit.coverUrl) body.coverUrl = hit.coverUrl;
      if (author.trim().length > 0) body.author = author.trim();
      if (nuSlug.trim().length > 0) body.novelUpdatesSlug = nuSlug.trim();
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
          <SheetTitle>{novelTitle(hit)}</SheetTitle>
        </SheetHeader>
        <div className="space-y-2">
          <Label htmlFor="author">Author</Label>
          <Input
            id="author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author name (used in the path)"
          />
          {(hit.author === null || hit.author === undefined) && (
            <p className="text-xs text-muted-foreground">
              AniList didn&apos;t surface an author; fill manually for a cleaner folder structure.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="nu-slug">NovelUpdates slug (optional)</Label>
          <Input
            id="nu-slug"
            value={nuSlug}
            onChange={(e) => setNuSlug(e.target.value)}
            placeholder="e.g. mushoku-tensei"
          />
          {!nuSlugValid && (
            <p className="text-xs text-destructive">
              Slug must contain only lowercase letters, numbers, and hyphens.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Found on the NovelUpdates series URL, e.g. novelupdates.com/series/
            <em>mushoku-tensei</em>/
          </p>
          {nuResolveState.kind === 'loading' && (
            <p className="text-xs text-muted-foreground">Resolving NovelUpdates…</p>
          )}
          {nuResolveState.kind === 'matched' && (
            <p className="text-xs text-muted-foreground">
              NovelUpdates: <span className="font-mono">{nuResolveState.candidateTitle}</span>{' '}
              <span className="text-[var(--color-ok)]">✓</span>
            </p>
          )}
          {nuResolveState.kind === 'no-match' && (
            <p className="text-xs text-muted-foreground">
              No NovelUpdates match. Paste a slug manually if you have one.
            </p>
          )}
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
          <code className="block text-xs p-2 bg-muted rounded">{rootPath}</code>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={
              addMutation.isPending || effectiveQpId === null || !nuSlugValid || nuSlugMissing
            }
          >
            {addMutation.isPending ? 'Adding…' : 'Add to library'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
