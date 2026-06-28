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

export function GoogleBooksForm({ initialApiKey }: Props): React.JSX.Element {
  const [apiKey, setApiKey] = useState('');
  // Masked secret: a non-empty input is the only editable state, so it alone
  // determines dirtiness. Cleared on save below.
  useUnsavedChanges(apiKey.length > 0);
  const placeholder = initialApiKey
    ? 'unchanged (leave blank to keep)'
    : 'optional — enter a Google Books API key';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/googlebooks', {
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
      className="space-y-7"
    >
      <SettingsSection
        name="Google Books"
        description="Optional. Novel volume counts, covers, and descriptions are fetched from Google Books, which works without a key at a low daily quota. Add a key to raise the quota. Leave blank to keep the stored key."
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
        </div>
      </SettingsSection>
    </form>
  );
}
