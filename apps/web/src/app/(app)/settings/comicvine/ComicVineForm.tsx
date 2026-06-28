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

export function ComicVineForm({ initialApiKey }: Props): React.JSX.Element {
  const [apiKey, setApiKey] = useState('');
  // Masked secret: a non-empty input is the only editable state, so it alone
  // determines dirtiness. Cleared on save below.
  useUnsavedChanges(apiKey.length > 0);
  const placeholder = initialApiKey
    ? 'unchanged (leave blank to keep)'
    : 'enter your ComicVine API key';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/comicvine', {
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
      // Blank key falls back to the stored key server-side; only block when there
      // is neither a typed key nor a stored one.
      if (apiKey.length === 0 && !initialApiKey) throw new Error('enter API key to test');
      const r = await apiFetch('/api/comicvine/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
    },
    onSuccess: () => toast.success('Connection OK'),
    onError: (e: Error) => toast.error(`Connection failed: ${e.message}`),
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
        name="ComicVine"
        description="Your ComicVine API key enables comic metadata lookups. Leave blank to keep the stored key."
      >
        <SettingRow
          label={<Label htmlFor="apiKey">API key</Label>}
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
            disabled={testMutation.isPending || (apiKey.length === 0 && !initialApiKey)}
          >
            {testMutation.isPending ? 'Testing…' : 'Test'}
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
}
