'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { Button } from '@/components/ui/button';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { toast } from 'sonner';

type State = { enabled: boolean; key: string; createdAt: string | null };

export function ApiKeyCard(): React.JSX.Element {
  const [state, setState] = useState<State | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);

  async function refresh(): Promise<void> {
    try {
      const r = await apiFetch('/api/settings/api-key');
      if (!r.ok) {
        toast.error(`Failed to load settings (${r.status})`);
        return;
      }
      setState((await r.json()) as State);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function generate(): Promise<void> {
    setPending(true);
    try {
      const r = await apiFetch('/api/settings/api-key', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      if (!r.ok) throw new Error(`generate failed (${r.status})`);
      const next = (await r.json()) as State;
      setState(next);
      setRevealed(true);
      toast.success('API key generated. Reload the page so the bundled UI picks it up.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function disable(): Promise<void> {
    setPending(true);
    try {
      const r = await apiFetch('/api/settings/api-key', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'disable' }),
      });
      if (!r.ok) throw new Error(`disable failed (${r.status})`);
      const next = (await r.json()) as State;
      setState(next);
      setRevealed(false);
      toast.success('API auth disabled.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function testKey(): Promise<void> {
    setPending(true);
    try {
      const r = await apiFetch('/api/settings/api-key/test', { method: 'POST' });
      const body = await r.json();
      if (r.ok && body.ok) toast.success('OK. The current request was authenticated.');
      else toast.error(`Failed (${r.status}) ${body.error ?? ''}`);
    } finally {
      setPending(false);
    }
  }

  if (state === null) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <SettingsSection
      name="API key"
      description="Authenticate the Readarr-compatible API with a single key. Required when external clients talk to bookkeeprr."
    >
      <SettingRow
        label="Status"
        control={
          <span className={state.enabled ? 'text-[var(--color-ok)]' : 'text-muted-foreground'}>
            {state.enabled ? 'Enabled' : 'Disabled'}
          </span>
        }
      />

      {state.enabled && (
        <div className="space-y-2 pt-3.5">
          <div className="font-mono text-xs break-all bg-muted p-2 rounded">
            {revealed ? state.key : '•'.repeat(43)}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Hide' : 'Reveal'}
            </Button>
            <Button variant="ghost" size="sm" onClick={testKey} disabled={pending}>
              Test
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Created: <span className="font-mono">{state.createdAt}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Example:{' '}
            <code className="font-mono">
              curl -H &apos;X-Api-Key: …&apos; http://localhost:3000/api/readarr/v1/system/status
            </code>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={generate} disabled={pending}>
          {state.enabled ? 'Rotate key' : 'Generate key'}
        </Button>
        {state.enabled && (
          <Button variant="destructive" onClick={disable} disabled={pending}>
            Disable auth
          </Button>
        )}
      </div>
    </SettingsSection>
  );
}
