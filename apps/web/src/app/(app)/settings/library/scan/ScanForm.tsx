'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { GroupPicker } from '@/components/library/groups/GroupPicker';
import { useLibraryGroups } from '@/components/library/groups/useLibraryGroups';
import { useLocalStorage } from '@/components/hooks/useLocalStorage';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';

type ScanResponse = { jobId: number };
type Structure = 'flat' | 'mirror';

type StructureOption = {
  value: Structure;
  testId: string;
  title: string;
  description: React.ReactNode;
};

const STRUCTURE_OPTIONS: StructureOption[] = [
  {
    value: 'flat',
    testId: 'scan-structure-flat',
    title: 'Flat',
    description:
      'Every matched series lands directly in the target group. The on-disk folder layout is ignored.',
  },
  {
    value: 'mirror',
    testId: 'scan-structure-mirror',
    title: 'Mirror folders as groups',
    description: (
      <>
        Subfolders become nested groups under the target —{' '}
        <span className="font-mono">backlog/Shonen</span> → group &ldquo;Shonen&rdquo;.
      </>
    ),
  },
];

export function ScanForm(): React.JSX.Element {
  const [rootPath, setRootPath] = useLocalStorage<string>('scan:lastRootPath', '/media/comics');
  const [, setJobId] = useLocalStorage<number | null>('scan:jobId', null);
  const [targetGroupId, setTargetGroupId] = useState<number | null>(null);
  const [structure, setStructure] = useState<Structure>('flat');
  const { groups, loading: groupsLoading } = useLibraryGroups();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (path: string): Promise<ScanResponse> => {
      // Defaults are server-side too — keep the body minimal.
      const body: { rootPath: string; targetGroupId?: number; structure?: Structure } = {
        rootPath: path,
      };
      if (targetGroupId !== null) body.targetGroupId = targetGroupId;
      if (structure === 'mirror') body.structure = structure;
      const res = await apiFetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        throw new Error('A scan is already in progress.');
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as ScanResponse;
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success('Scan started');
      qc.invalidateQueries({ queryKey: ['scan', 'job'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(rootPath);
      }}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <Label htmlFor="rootPath">Root path</Label>
          <Input
            id="rootPath"
            name="rootPath"
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="/media/comics"
          />
        </div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Starting…' : 'Run scan'}
        </Button>
      </div>
      <div className="max-w-sm space-y-1">
        <Label>Import into</Label>
        <GroupPicker
          groups={groups}
          value={targetGroupId}
          onChange={setTargetGroupId}
          disabled={groupsLoading}
          testId="scan-group-picker"
        />
      </div>
      <div className="space-y-2">
        <Label>Folder structure</Label>
        <RadioGroup
          value={structure}
          onValueChange={(v) => setStructure(v as Structure)}
          className="gap-0 overflow-hidden rounded-md border border-border"
        >
          {STRUCTURE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              htmlFor={`scan-structure-${opt.value}`}
              data-testid={opt.testId}
              className={cn(
                'flex cursor-pointer items-start gap-3 px-3.5 py-3 transition-colors',
                opt.value !== 'flat' && 'border-t border-border',
                structure === opt.value
                  ? // Solid selected tint — the feature's color-mix idiom; never translucent.
                    'bg-[color-mix(in_oklch,var(--color-primary)_16%,var(--color-card))]'
                  : 'hover:bg-muted',
              )}
            >
              <RadioGroupItem
                id={`scan-structure-${opt.value}`}
                value={opt.value}
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{opt.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {opt.description}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>
    </form>
  );
}
