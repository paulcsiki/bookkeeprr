'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';

type SettingsResponse = {
  discordWebhookUrl: string | null;
  discordWebhookConfigured: boolean;
  discordUsername: string;
  discordAvatarUrl: string | null;
  appriseUrl: string | null;
  appriseConfigured: boolean;
  eventGrabSuccess: boolean;
  eventImportSuccess: boolean;
  eventFailure: boolean;
};

type TestResult = {
  discord: 'ok' | 'not-configured' | { error: string };
  apprise: 'ok' | 'not-configured' | { error: string };
};

export function NotificationsForm(): React.JSX.Element {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['notifications-settings'],
    queryFn: async (): Promise<SettingsResponse> => {
      const r = await apiFetch('/api/settings/notifications');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');
  const [discordAvatarUrl, setDiscordAvatarUrl] = useState('');
  const [appriseUrl, setAppriseUrl] = useState('');
  const [eventGrabSuccess, setEventGrabSuccess] = useState(true);
  const [eventImportSuccess, setEventImportSuccess] = useState(true);
  const [eventFailure, setEventFailure] = useState(true);

  useEffect(() => {
    if (!settings.data) return;
    setDiscordWebhookUrl('');
    setDiscordUsername(settings.data.discordUsername);
    setDiscordAvatarUrl(settings.data.discordAvatarUrl ?? '');
    setAppriseUrl('');
    setEventGrabSuccess(settings.data.eventGrabSuccess);
    setEventImportSuccess(settings.data.eventImportSuccess);
    setEventFailure(settings.data.eventFailure);
  }, [settings.data]);

  // Dirty when a masked secret has input, or a visible field diverges from the
  // last-fetched server state. After a successful save the query is invalidated,
  // the effect above re-syncs these fields, and the form goes clean again.
  const d = settings.data;
  const dirty =
    d != null &&
    (discordWebhookUrl.length > 0 ||
      appriseUrl.length > 0 ||
      discordUsername !== d.discordUsername ||
      discordAvatarUrl !== (d.discordAvatarUrl ?? '') ||
      eventGrabSuccess !== d.eventGrabSuccess ||
      eventImportSuccess !== d.eventImportSuccess ||
      eventFailure !== d.eventFailure);
  useUnsavedChanges(dirty);

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiFetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          discordWebhookUrl,
          discordUsername,
          discordAvatarUrl: discordAvatarUrl || null,
          appriseUrl,
          eventGrabSuccess,
          eventImportSuccess,
          eventFailure,
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
    },
    onSuccess: () => {
      toast.success('Saved');
      // Clear the secret inputs so the form goes clean. The refetch alone won't
      // do it: a secret-only change returns an identical masked GET, so the
      // sync effect never fires.
      setDiscordWebhookUrl('');
      setAppriseUrl('');
      void qc.invalidateQueries({ queryKey: ['notifications-settings'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const test = useMutation({
    mutationFn: async (): Promise<TestResult> => {
      const r = await apiFetch('/api/settings/notifications/test', { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: (result) => {
      const lines: string[] = [];
      for (const [transport, status] of Object.entries(result)) {
        if (status === 'ok') lines.push(`${transport}: ok`);
        else if (status === 'not-configured') lines.push(`${transport}: not configured`);
        else lines.push(`${transport}: ${status.error}`);
      }
      toast.message('Test result', { description: lines.join('\n') });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!settings.data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-7">
      <SettingsSection
        name={
          <span className="flex items-center gap-2">
            Discord
            {settings.data.discordWebhookConfigured && (
              <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--color-ok)]">
                Connected
              </span>
            )}
          </span>
        }
        description="Post grab and import notifications to a Discord channel via webhook."
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="discord-url">Webhook URL</Label>
            <Input
              id="discord-url"
              type="password"
              value={discordWebhookUrl}
              placeholder={
                settings.data.discordWebhookConfigured
                  ? '•••••••• (leave blank to keep)'
                  : 'https://discord.com/api/webhooks/…'
              }
              onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discord-username">Username</Label>
            <Input
              id="discord-username"
              value={discordUsername}
              onChange={(e) => setDiscordUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discord-avatar">Avatar URL (optional)</Label>
            <Input
              id="discord-avatar"
              value={discordAvatarUrl}
              onChange={(e) => setDiscordAvatarUrl(e.target.value)}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        name={
          <span className="flex items-center gap-2">
            Apprise
            {settings.data.appriseConfigured && (
              <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--color-ok)]">
                Connected
              </span>
            )}
          </span>
        }
        description="Fan notifications out to dozens of services via an Apprise API endpoint."
      >
        <div className="space-y-2">
          <Label htmlFor="apprise-url">Apprise URL</Label>
          <Input
            id="apprise-url"
            type="password"
            value={appriseUrl}
            placeholder={
              settings.data.appriseConfigured
                ? '•••••••• (leave blank to keep)'
                : 'http://apprise:8000/notify/<token>'
            }
            onChange={(e) => setAppriseUrl(e.target.value)}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        name="Events"
        description="Choose which events trigger a notification on the channels above."
      >
        <SettingRow
          label="Grab success"
          control={
            <Switch id="ev-grab" checked={eventGrabSuccess} onCheckedChange={setEventGrabSuccess} />
          }
        />
        <SettingRow
          label="Import success"
          control={
            <Switch
              id="ev-import"
              checked={eventImportSuccess}
              onCheckedChange={setEventImportSuccess}
            />
          }
        />
        <SettingRow
          label="Grab or import failure"
          control={
            <Switch id="ev-failure" checked={eventFailure} onCheckedChange={setEventFailure} />
          }
        />
      </SettingsSection>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? 'Testing…' : 'Send test'}
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
