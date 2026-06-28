'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';

type Initial = {
  host: string;
  port: number;
  username: string;
  password: string;
  useHttps: boolean;
};

type Props = { initial: Initial };

export function QbtConfigForm({ initial }: Props): React.JSX.Element {
  // Saved baseline for the non-secret fields; re-set on a successful save.
  const [saved, setSaved] = useState({
    host: initial.host,
    port: initial.port,
    username: initial.username,
    useHttps: initial.useHttps,
  });
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState(''); // never pre-fill
  const [useHttps, setUseHttps] = useState(initial.useHttps);
  const passwordPlaceholder = initial.password
    ? 'unchanged (leave blank to keep)'
    : 'enter password';

  // A non-empty password (masked secret) counts as dirty too.
  const dirty =
    host !== saved.host ||
    port !== saved.port ||
    username !== saved.username ||
    useHttps !== saved.useHttps ||
    password.length > 0;
  useUnsavedChanges(dirty);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/qbt', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host, port, username, password, useHttps }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      setSaved({ host, port, username, useHttps });
      setPassword('');
      toast.success('Saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      // Blank password falls back to the stored one server-side; only block when
      // there is neither a typed password nor a stored one.
      if (password.length === 0 && !initial.password) {
        throw new Error('enter password to test');
      }
      const r = await apiFetch('/api/qbt/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host, port, username, password, useHttps }),
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
        name="Connection"
        description="Where bookkeeprr reaches your qBittorrent Web UI and the credentials it logs in with."
      >
        <SettingRow
          label={<Label htmlFor="host">Host</Label>}
          control={
            <Input
              id="host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="qbt.local"
            />
          }
        />
        <SettingRow
          label={<Label htmlFor="port">Port</Label>}
          control={
            <Input
              id="port"
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value || '0', 10))}
            />
          }
        />
        <SettingRow
          label={<Label htmlFor="username">Username</Label>}
          control={
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          }
        />
        <SettingRow
          label={<Label htmlFor="password">Password</Label>}
          control={
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={passwordPlaceholder}
            />
          }
        />
        <SettingRow
          label={<Label htmlFor="useHttps">Use HTTPS</Label>}
          control={<Switch id="useHttps" checked={useHttps} onCheckedChange={setUseHttps} />}
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
            {testMutation.isPending ? 'Testing…' : 'Test connection'}
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
}
