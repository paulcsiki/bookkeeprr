'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { apiFetch } from '@/lib/api-fetch';

type Props = { initialUrl: string; hasKey: boolean };

type SyncSummary = { added: number; updated: number; disabled: number };

export function ProwlarrCard({ initialUrl, hasKey }: Props): React.JSX.Element {
  const qc = useQueryClient();
  const [url, setUrl] = useState(initialUrl);
  const [apiKey, setApiKey] = useState('');

  const testMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/indexers/prowlarr/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, apiKey }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
    },
    onSuccess: () => toast.success('Connection OK'),
    onError: (e: Error) => toast.error(`Connection failed: ${e.message}`),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const body = apiKey.length > 0 ? { url, apiKey } : {};
      const r = await apiFetch('/api/indexers/prowlarr/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      return b as SyncSummary;
    },
    onSuccess: (summary) => {
      toast.success(
        `Added ${summary.added} · updated ${summary.updated} · disabled ${summary.disabled}`,
      );
      setApiKey('');
      void qc.invalidateQueries({ queryKey: ['indexers'] });
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  });

  const placeholder = hasKey ? 'leave blank to keep current' : 'enter your Prowlarr API key';

  return (
    <SettingsSection
      name="Prowlarr"
      description="Auto-sync indexers from a Prowlarr instance. Synced indexers appear below tagged “via Prowlarr” and are kept up to date on each sync."
    >
      <div className="space-y-1">
        <SettingRow
          label={<Label htmlFor="prowlarr-url">URL</Label>}
          control={
            <Input
              id="prowlarr-url"
              className="w-[280px] font-mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://prowlarr:9696"
            />
          }
        />
        <SettingRow
          label={<Label htmlFor="prowlarr-apikey">API key</Label>}
          control={
            <Input
              id="prowlarr-apikey"
              type="password"
              className="w-[280px]"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={placeholder}
            />
          }
        />
      </div>
      <div className="flex gap-2 pt-4">
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || url.length === 0 || apiKey.length === 0}
        >
          {testMutation.isPending ? 'Testing…' : 'Test connection'}
        </Button>
      </div>
    </SettingsSection>
  );
}
