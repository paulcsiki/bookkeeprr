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

type Props = { initialClientId: string };

export function MalConfigForm({ initialClientId }: Props): React.JSX.Element {
  const [clientId, setClientId] = useState('');
  // Masked secret: a non-empty input is the only editable state. Cleared on save.
  useUnsavedChanges(clientId.length > 0);
  const placeholder = initialClientId
    ? 'unchanged (leave blank to keep)'
    : 'enter your MyAnimeList Client ID';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/mal', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Saved');
      setClientId('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/mal/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Send the entered Client ID so the user can test before saving.
        // If left blank, the stored Client ID is tested.
        body: JSON.stringify(clientId.length > 0 ? { clientId } : {}),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
    },
    onSuccess: () => toast.success('MyAnimeList OK'),
    onError: (e: Error) => toast.error(`MyAnimeList failed: ${e.message}`),
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
        name="MyAnimeList"
        description="Your MyAnimeList API Client ID enables manga search and metadata lookups. Leave blank to keep the stored value."
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Create a MAL API application at{' '}
            <a
              href="https://myanimelist.net/apiconfig"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              myanimelist.net/apiconfig
            </a>{' '}
            (account settings &rarr; API). MAL&rsquo;s form requires an{' '}
            <span className="font-mono">App Redirect URL</span> even though bookkeeprr does not use a
            callback &mdash; enter a placeholder such as your bookkeeprr base URL or{' '}
            <span className="font-mono">http://localhost</span>. Then copy the{' '}
            <span className="font-mono">Client ID</span> here.
          </p>
        </div>
        <SettingRow
          label={<Label htmlFor="clientId">Client ID</Label>}
          control={
            <Input
              id="clientId"
              type="password"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={placeholder}
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
