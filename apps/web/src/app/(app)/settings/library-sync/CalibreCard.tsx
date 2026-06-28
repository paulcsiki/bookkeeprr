'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { apiFetch } from '@/lib/api-fetch';

type Settings = {
  baseUrl: string | null;
  username: string | null;
  password: string | null;
  libraryId: string;
  contentTypes: ContentType[];
  enabled: boolean;
  configured: boolean;
};

export function CalibreCard(): React.JSX.Element {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['library-sync-calibre-settings'],
    queryFn: async (): Promise<Settings> => {
      const r = await apiFetch('/api/settings/library-sync/calibre');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [libraryId, setLibraryId] = useState('0');
  const [contentTypes, setContentTypes] = useState<ContentType[]>(['ebook']);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setBaseUrl(settings.data.baseUrl ?? '');
    setUsername(settings.data.username ?? '');
    setPassword('');
    setLibraryId(settings.data.libraryId);
    setContentTypes(settings.data.contentTypes);
    setEnabled(settings.data.enabled);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/library-sync/calibre', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseUrl,
          username: username || null,
          password,
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
      // Clear the password input so the form goes clean (a password-only change
      // returns an identical masked GET, so the refetch sync effect won't reset it).
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['library-sync-calibre-settings'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const test = useMutation({
    mutationFn: async (): Promise<{ ok?: boolean; error?: string }> => {
      const r = await apiFetch('/api/settings/library-sync/calibre/test', { method: 'POST' });
      return r.json();
    },
    onSuccess: (result) => {
      if (result.ok) toast.success('Calibre: refresh triggered');
      else toast.error(`Calibre: ${result.error ?? 'failed'}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleType(t: ContentType): void {
    setContentTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  // Dirty when the masked password has input or a visible field diverges from
  // the last-fetched server state. A successful save invalidates the query, the
  // effect re-syncs these fields, and the form goes clean again.
  const d = settings.data;
  const dirty =
    d != null &&
    (password.length > 0 ||
      baseUrl !== (d.baseUrl ?? '') ||
      username !== (d.username ?? '') ||
      libraryId !== d.libraryId ||
      enabled !== d.enabled ||
      JSON.stringify(contentTypes) !== JSON.stringify(d.contentTypes));
  useUnsavedChanges(dirty);

  if (!settings.data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <SettingsSection
      name={
        <span className="flex items-center gap-2">
          Calibre Content Server
          {settings.data.configured && (
            <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--color-ok)]">
              Connected
            </span>
          )}
        </span>
      }
      description="Trigger a library refresh in your Calibre Content Server when matching content is imported."
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="cb-url">Base URL</Label>
          <Input
            id="cb-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://calibre.local:8080"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cb-username">Username (optional)</Label>
          <Input
            id="cb-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="leave blank if your Calibre runs unauthenticated"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cb-password">Password</Label>
          <Input
            id="cb-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              settings.data.configured && settings.data.password
                ? '•••••••• (leave blank to keep)'
                : ''
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cb-library">Library ID</Label>
          <Input
            id="cb-library"
            value={libraryId}
            onChange={(e) => setLibraryId(e.target.value)}
            placeholder="0 (default Calibre library)"
          />
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
          control={<Switch id="cb-enabled" checked={enabled} onCheckedChange={setEnabled} />}
        />

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? 'Testing…' : 'Send test refresh'}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
