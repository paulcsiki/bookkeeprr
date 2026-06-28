'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { apiFetch } from '@/lib/api-fetch';

type Settings = {
  baseUrl: string | null;
  apiToken: string | null;
  libraryId: string | null;
  contentTypes: ContentType[];
  enabled: boolean;
  configured: boolean;
};

type Library = { id: string; name: string; mediaType: 'book' };

export function AudiobookshelfCard(): React.JSX.Element {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['library-sync-abs-settings'],
    queryFn: async (): Promise<Settings> => {
      const r = await apiFetch('/api/settings/library-sync/audiobookshelf');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const [baseUrl, setBaseUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [libraryId, setLibraryId] = useState('');
  const [contentTypes, setContentTypes] = useState<ContentType[]>(['audiobook']);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setBaseUrl(settings.data.baseUrl ?? '');
    setApiToken('');
    setLibraryId(settings.data.libraryId ?? '');
    setContentTypes(settings.data.contentTypes);
    setEnabled(settings.data.enabled);
  }, [settings.data]);

  const libraries = useQuery({
    queryKey: ['library-sync-abs-libraries', settings.data?.configured],
    enabled: settings.data?.configured ?? false,
    queryFn: async (): Promise<Library[]> => {
      const r = await apiFetch('/api/settings/library-sync/audiobookshelf/libraries');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { libraries: Library[] };
      return body.libraries;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/library-sync/audiobookshelf', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseUrl,
          apiToken,
          libraryId,
          contentTypes,
          enabled,
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Saved');
      // Clear the token input so the form goes clean (a token-only change returns
      // an identical masked GET, so the refetch sync effect won't reset it).
      setApiToken('');
      void qc.invalidateQueries({ queryKey: ['library-sync-abs-settings'] });
      void qc.invalidateQueries({ queryKey: ['library-sync-abs-libraries'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const test = useMutation({
    mutationFn: async (): Promise<{ ok?: boolean; error?: string }> => {
      const r = await apiFetch('/api/settings/library-sync/audiobookshelf/test', {
        method: 'POST',
      });
      return r.json();
    },
    onSuccess: (result) => {
      if (result.ok) toast.success('Audiobookshelf: scan triggered');
      else toast.error(`Audiobookshelf: ${result.error ?? 'failed'}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleType(t: ContentType): void {
    setContentTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  // Dirty when the masked token has input or a visible field diverges from the
  // last-fetched server state. A successful save invalidates the query, the
  // effect re-syncs these fields, and the form goes clean again.
  const d = settings.data;
  const dirty =
    d != null &&
    (apiToken.length > 0 ||
      baseUrl !== (d.baseUrl ?? '') ||
      libraryId !== (d.libraryId ?? '') ||
      enabled !== d.enabled ||
      JSON.stringify(contentTypes) !== JSON.stringify(d.contentTypes));
  useUnsavedChanges(dirty);

  if (!settings.data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <SettingsSection
      name={
        <span className="flex items-center gap-2">
          Audiobookshelf
          {settings.data.configured && (
            <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--color-ok)]">
              Connected
            </span>
          )}
        </span>
      }
      description="Trigger a library scan in Audiobookshelf when matching content is imported."
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="abs-url">Base URL</Label>
          <Input
            id="abs-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://audiobookshelf.local:13378"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="abs-token">API token</Label>
          <Input
            id="abs-token"
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={
              settings.data.configured ? '•••••••• (leave blank to keep)' : 'paste your token'
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="abs-library">Library</Label>
          {libraries.data && libraries.data.length > 0 ? (
            <Select value={libraryId} onValueChange={setLibraryId}>
              <SelectTrigger id="abs-library">
                <SelectValue placeholder="(select)" />
              </SelectTrigger>
              <SelectContent>
                {libraries.data.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="abs-library"
              value={libraryId}
              onChange={(e) => setLibraryId(e.target.value)}
              placeholder="library id (save credentials first to fetch the list)"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>Refresh on imports of</Label>
          <div className="flex flex-wrap gap-3">
            {CONTENT_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={contentTypes.includes(t)}
                  onCheckedChange={() => toggleType(t)}
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <SettingRow
          label="Enabled"
          control={<Switch id="abs-enabled" checked={enabled} onCheckedChange={setEnabled} />}
        />

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? 'Testing…' : 'Send test scan'}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
