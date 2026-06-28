'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';

type Channel = 'email' | 'push' | 'webhook';

type Prefs = {
  eventGrabSuccess: boolean;
  eventImportSuccess: boolean;
  eventFailure: boolean;
  eventUpdateAvailable: boolean;
  channel: Channel;
};

const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
  { value: 'webhook', label: 'Webhook' },
];

const EVENT_ROWS: Array<{ key: keyof Omit<Prefs, 'channel'>; label: string; sub: string }> = [
  { key: 'eventGrabSuccess', label: 'Grab completed', sub: 'When a torrent finishes downloading' },
  {
    key: 'eventImportSuccess',
    label: 'Import completed',
    sub: 'When a file is successfully imported to the library',
  },
  {
    key: 'eventFailure',
    label: 'Grab failed',
    sub: 'When a grab or import encounters an error',
  },
  {
    key: 'eventUpdateAvailable',
    label: 'Weekly digest',
    sub: 'Periodic update on new volume availability',
  },
];

async function patchPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const r = await apiFetch('/api/auth/me/notifications', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update preferences');
  }
  const body = (await r.json()) as { prefs: Prefs };
  return body.prefs;
}

export function NotificationsSection(): React.JSX.Element {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/auth/me/notifications')
      .then((r) => r.json() as Promise<{ prefs: Prefs }>)
      .then((j) => setPrefs(j.prefs))
      .catch(() => toast.error('Could not load notification preferences'))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: keyof Omit<Prefs, 'channel'>): Promise<void> {
    if (!prefs) return;
    const next = !prefs[key];
    const optimistic = { ...prefs, [key]: next };
    setPrefs(optimistic);
    try {
      const updated = await patchPrefs({ [key]: next });
      setPrefs(updated);
    } catch (err) {
      setPrefs(prefs);
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function setChannel(channel: Channel): Promise<void> {
    if (!prefs) return;
    const optimistic = { ...prefs, channel };
    setPrefs(optimistic);
    try {
      const updated = await patchPrefs({ channel });
      setPrefs(updated);
    } catch (err) {
      setPrefs(prefs);
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  return (
    <>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !prefs ? null : (
        <div className="space-y-5">
          <div className="divide-y divide-border rounded-md border border-border">
            {EVENT_ROWS.map(({ key, label, sub }) => (
              <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
                </div>
                <Switch
                  checked={prefs[key]}
                  onCheckedChange={() => void toggle(key)}
                  aria-label={label}
                />
              </div>
            ))}
          </div>

          {/* Channel segmented control */}
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Delivery channel
            </div>
            <div className="flex gap-1 rounded-md border border-border p-0.5">
              {CHANNELS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => void setChannel(value)}
                  className={cn(
                    'flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                    prefs.channel === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
