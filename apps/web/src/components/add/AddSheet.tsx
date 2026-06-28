'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import type { MangaSheetHit } from './result-adapter';
import { apiFetch } from '@/lib/api-fetch';

const FormSchema = z.object({
  rootPath: z.string().min(1),
  monitoring: z.enum(['none', 'all', 'future', 'missing']),
  granularity: z.enum(['volume', 'chapter']),
  // `z.number()` (not `z.coerce.number()`) — the Select onChange converts
  // string→number before setValue, so the form value is always a number.
  // Zod 4 changed coerce.number()'s Input type to `unknown`, which breaks
  // the @hookform/resolvers/zod Resolver inference.
  qualityProfileId: z.number().int().positive(),
});

type FormValues = z.infer<typeof FormSchema>;

type QualityProfile = { id: number; name: string };

type Props = {
  hit: MangaSheetHit | null;
  onClose: () => void;
  /** "Add into" library group selection — null/omitted means Library root. */
  groupId?: number | null;
};

export function AddSheet({ hit, onClose, groupId = null }: Props): React.JSX.Element {
  const qc = useQueryClient();
  const profilesQuery = useQuery<QualityProfile[]>({
    queryKey: ['quality-profiles'],
    queryFn: async () => {
      const res = await apiFetch('/api/quality-profiles');
      if (!res.ok) throw new Error('failed to load quality profiles');
      return res.json();
    },
  });
  const defaultProfileId = profilesQuery.data?.[0]?.id ?? 1;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      rootPath: '/media/comics/' + (hit?.titleEnglish ?? hit?.titleRomaji ?? ''),
      monitoring: 'all',
      granularity: 'volume',
      qualityProfileId: defaultProfileId,
    },
  });

  useEffect(() => {
    if (hit) {
      form.reset({
        rootPath: '/media/comics/' + (hit.titleEnglish ?? hit.titleRomaji ?? ''),
        monitoring: 'all',
        granularity: 'volume',
        qualityProfileId: defaultProfileId,
      });
    }
  }, [hit, defaultProfileId, form]);

  const addMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!hit) throw new Error('no series selected');
      const res = await apiFetch('/api/series', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contentType: 'manga',
          // AniList-only / cross-linked send anilistId; MAL-only omit it (and
          // send malId) so the server routes to mal_hydrate. Never send 0.
          ...(hit.anilistId != null ? { anilistId: hit.anilistId } : {}),
          ...(hit.malId != null ? { malId: hit.malId } : {}),
          status: hit.status,
          titleEnglish: hit.titleEnglish,
          titleRomaji: hit.titleRomaji,
          titleNative: hit.titleNative,
          coverUrl: hit.coverUrl,
          rootPath: values.rootPath,
          monitoring: values.monitoring,
          granularity: values.granularity,
          qualityProfileId: values.qualityProfileId,
          ...(groupId != null ? { groupId } : {}),
        }),
      });
      if (res.status === 409) throw new Error('series already exists');
      if (!res.ok) throw new Error(`failed to add (${res.status})`);
      return res.json();
    },
    onSuccess: (data) => {
      toast.success('Added "' + (data.titleEnglish ?? data.titleRomaji ?? 'series') + '"');
      qc.invalidateQueries({ queryKey: ['series', 'list'] });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Sheet open={hit !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{hit ? `Add ${hit.titleEnglish ?? hit.titleRomaji}` : ''}</SheetTitle>
        </SheetHeader>
        <form className="space-y-4 mt-4" onSubmit={form.handleSubmit((v) => addMutation.mutate(v))}>
          <div className="space-y-2">
            <Label htmlFor="rootPath">Root path</Label>
            <Input id="rootPath" {...form.register('rootPath')} />
          </div>
          <div className="space-y-2">
            <Label>Monitoring</Label>
            <Select
              value={form.watch('monitoring')}
              onValueChange={(v) => form.setValue('monitoring', v as FormValues['monitoring'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="missing">Missing only</SelectItem>
                <SelectItem value="future">Future only</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Granularity</Label>
            <Select
              value={form.watch('granularity')}
              onValueChange={(v) => form.setValue('granularity', v as FormValues['granularity'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="volume">Volume</SelectItem>
                <SelectItem value="chapter">Chapter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quality profile</Label>
            <Select
              value={String(form.watch('qualityProfileId'))}
              onValueChange={(v) => form.setValue('qualityProfileId', Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(profilesQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
