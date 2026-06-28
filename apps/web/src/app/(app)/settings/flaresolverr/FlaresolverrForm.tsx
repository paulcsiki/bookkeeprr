'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';

type Props = { initialUrl: string };

export function FlaresolverrForm({ initialUrl }: Props): React.JSX.Element {
  const [saved, setSaved] = useState(initialUrl);
  const [url, setUrl] = useState(initialUrl);

  useUnsavedChanges(url !== saved);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/flaresolverr', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      setSaved(url);
      toast.success('Saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/flaresolverr/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Send the entered URL so the user can test before saving. If left
        // blank, the stored URL is tested.
        body: JSON.stringify(url.trim().length > 0 ? { url } : {}),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
    },
    onSuccess: () => toast.success('FlareSolverr OK'),
    onError: (e: Error) => toast.error(`FlareSolverr failed: ${e.message}`),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
      className="space-y-7"
    >
      <SettingsSection
        name="FlareSolverr"
        description="A self-hosted proxy that solves Cloudflare’s “Just a moment” JS challenge. When set, NovelUpdates requests are routed through it; leave blank to fetch directly."
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            NovelUpdates sits behind Cloudflare, which returns{' '}
            <span className="font-mono">403</span> for plain server-side fetches. Run FlareSolverr
            (the same proxy used by Sonarr / Radarr / Prowlarr) and point bookkeeprr at it. The URL
            is typically <span className="font-mono">http://flaresolverr:8191</span>.
          </p>
        </div>
        <SettingRow
          label={<Label htmlFor="flaresolverr-url">URL</Label>}
          control={
            <Input
              id="flaresolverr-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://flaresolverr:8191"
              className="font-mono"
            />
          }
        />
        <div className="flex gap-2 pt-4">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? 'Testing…' : 'Test'}
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
}
