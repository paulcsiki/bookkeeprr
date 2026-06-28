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

type Props = { initialApiKey: string };

export function NytConfigForm({ initialApiKey }: Props): React.JSX.Element {
  const [apiKey, setApiKey] = useState('');
  // Masked secret: a non-empty input is the only editable state. Cleared on save.
  useUnsavedChanges(apiKey.length > 0);
  const placeholder = initialApiKey
    ? 'unchanged (leave blank to keep)'
    : 'enter your New York Times API key';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/nyt', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Saved');
      setApiKey('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/nyt/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Send the entered API key so the user can test before saving.
        // If left blank, the stored API key is tested.
        body: JSON.stringify(apiKey.length > 0 ? { apiKey } : {}),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
    },
    onSuccess: () => toast.success('New York Times OK'),
    onError: (e: Error) => toast.error(`New York Times failed: ${e.message}`),
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
        name="New York Times Books API"
        description="Your New York Times API key enables sourcing audiobook bestsellers (audio-fiction and audio-nonfiction lists). Leave blank to keep the stored value."
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Get a free key at{' '}
            <a
              href="https://developer.nytimes.com"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              developer.nytimes.com
            </a>{' '}
            &mdash; sign in, create an app, then enable the{' '}
            <span className="font-mono">Books API</span> for that app. Copy the app&rsquo;s{' '}
            <span className="font-mono">API Key</span> here.
          </p>
        </div>
        <SettingRow
          label={<Label htmlFor="apiKey">API Key</Label>}
          control={
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
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
