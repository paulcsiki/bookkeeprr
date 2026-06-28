'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { SeriesRow, QualityProfileRow, BookSeriesRow } from '@/server/db/schema';
import { apiFetch } from '@/lib/api-fetch';
import { GroupPicker } from '@/components/library/groups/GroupPicker';
import { useLibraryGroups } from '@/components/library/groups/useLibraryGroups';
import { displayPath } from '@/components/library/groups/lib';
import { SeriesMembershipControl } from './SeriesMembershipControl';

const FormSchema = z.object({
  rootPath: z.string().min(1),
  monitoring: z.enum(['none', 'all', 'future', 'missing']),
  granularity: z.enum(['volume', 'chapter']),
  qualityProfileId: z.number().int().positive(),
  extraSearchTerms: z.string(),
});

type Values = z.infer<typeof FormSchema>;

type Props = {
  series: SeriesRow;
  qualityProfiles: QualityProfileRow[];
  bookSeries?: (BookSeriesRow & { memberCount: number }) | null;
};

function parseExtraSearchTerms(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

export function SettingsTab({ series, qualityProfiles, bookSeries = null }: Props): React.JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const titleForDelete = series.titleEnglish ?? series.titleRomaji ?? `series-${series.id}`;
  const form = useForm<Values>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      rootPath: series.rootPath,
      monitoring: series.monitoring,
      granularity: series.granularity,
      qualityProfileId: series.qualityProfileId,
      extraSearchTerms: parseExtraSearchTerms(series.extraSearchTermsJson).join(', '),
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (v: Values) => {
      const terms = v.extraSearchTerms
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await apiFetch(`/api/series/${series.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rootPath: v.rootPath,
          monitoring: v.monitoring,
          granularity: v.granularity,
          qualityProfileId: v.qualityProfileId,
          extraSearchTermsJson: JSON.stringify(terms),
        }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['series'] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Library group — saved immediately on change (a move, not a form field).
  const { groups, loading: groupsLoading } = useLibraryGroups();
  const groupMutation = useMutation({
    mutationFn: async (groupId: number | null) => {
      const res = await apiFetch(`/api/series/${series.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      if (!res.ok) throw new Error(`group change failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      toast.success('Group updated');
      qc.invalidateQueries({ queryKey: ['series'] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const groupPathLabel = groupsLoading ? null : displayPath(groups, series.groupId) || 'Library root';

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/series/${series.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`delete failed (${res.status})`);
    },
    onSuccess: () => {
      toast.success(`Deleted "${titleForDelete}"`);
      qc.invalidateQueries({ queryKey: ['series'] });
      router.push('/library');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-4 mt-4 max-w-xl"
      onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
    >
      <div className="space-y-2">
        <Label htmlFor="rootPath">Root path</Label>
        <Input id="rootPath" {...form.register('rootPath')} />
      </div>
      <div className="space-y-2">
        <Label>Monitoring</Label>
        <Select
          value={form.watch('monitoring')}
          onValueChange={(v) => form.setValue('monitoring', v as Values['monitoring'])}
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
          onValueChange={(v) => form.setValue('granularity', v as Values['granularity'])}
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
            {qualityProfiles.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Group</Label>
        <GroupPicker
          groups={groups}
          value={series.groupId}
          onChange={(v) => groupMutation.mutate(v)}
          disabled={groupsLoading || groupMutation.isPending}
          testId="detail-group-picker"
        />
        <p className="font-mono text-[10.5px] text-muted-foreground">
          {groupPathLabel != null ? `${groupPathLabel} · ` : ''}folder re-routes on the next
          rename
        </p>
      </div>
      {(series.contentType === 'ebook' || series.contentType === 'audiobook') && (
        <SeriesMembershipControl series={series} initialBookSeries={bookSeries} />
      )}
      <div className="space-y-2">
        <Label htmlFor="extraSearchTerms">Extra search terms (comma-separated)</Label>
        <Input id="extraSearchTerms" {...form.register('extraSearchTerms')} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive">
              Delete series
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this series?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the series from bookkeeprr. Files on disk are not deleted. Type the
                title to confirm: <strong>{titleForDelete}</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={titleForDelete}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText !== titleForDelete || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}
