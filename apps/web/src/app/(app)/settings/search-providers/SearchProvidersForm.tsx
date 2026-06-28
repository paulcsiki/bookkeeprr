'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';
import type { SearchProviders } from '@/server/db/settings/search-providers';

type ProviderKey = keyof SearchProviders;

const PROVIDERS: { key: ProviderKey; label: string; help: string }[] = [
  { key: 'anilist', label: 'AniList', help: 'Manga & light novels.' },
  { key: 'mal', label: 'MyAnimeList', help: 'Manga cross-link and MAL-only titles (needs a MyAnimeList client id).' },
  { key: 'mangadex', label: 'MangaDex', help: 'Manga title completion and cross-linking.' },
  { key: 'comicvine', label: 'ComicVine', help: 'Comics (needs a ComicVine API key).' },
  { key: 'openlibrary', label: 'OpenLibrary', help: 'Ebooks.' },
  { key: 'audnex', label: 'Audnex', help: 'Audiobooks.' },
  { key: 'novelupdates', label: 'NovelUpdates', help: 'Web / Korean novels (needs FlareSolverr).' },
];

function sameProviders(a: SearchProviders, b: SearchProviders): boolean {
  return PROVIDERS.every((p) => a[p.key] === b[p.key]);
}

export function SearchProvidersForm({
  initial,
}: {
  initial: SearchProviders;
}): React.JSX.Element {
  const [saved, setSaved] = useState<SearchProviders>(initial);
  const [providers, setProviders] = useState<SearchProviders>(initial);

  const dirty = !sameProviders(providers, saved);
  useUnsavedChanges(dirty);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/search-providers', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(providers),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      setSaved(providers);
      toast.success('Saved');
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
        name="Search providers"
        description="Turn discovery sources on or off. Disabled providers are skipped entirely when you search — no requests are sent and no results appear."
      >
        <div>
          {PROVIDERS.map((p) => (
            <SettingRow
              key={p.key}
              label={<Label htmlFor={`provider-${p.key}`}>{p.label}</Label>}
              help={p.help}
              control={
                <Switch
                  id={`provider-${p.key}`}
                  checked={providers[p.key]}
                  onCheckedChange={(v) =>
                    setProviders((prev) => ({ ...prev, [p.key]: v }))
                  }
                />
              }
            />
          ))}
        </div>
        <div className="flex gap-2 pt-4">
          <Button type="submit" disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
}
