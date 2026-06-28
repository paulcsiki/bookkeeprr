'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { VersionHistoryDialog } from '@/components/VersionHistoryDialog';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${String(d)}d ${String(h)}h ${String(m)}m`;
  if (h > 0) return `${String(h)}h ${String(m)}m`;
  return `${String(m)}m`;
}

type Mode = 'auto' | 'docker' | 'kubernetes' | 'unknown';

type Frequency = 'hourly' | 'daily' | 'weekly' | 'off';
type Behavior = 'notify' | 'auto-download' | 'auto-install';

type Props = {
  initial: {
    config: {
      frequency: Frequency;
      behavior: Behavior;
      notifyOnIntegrations: boolean;
      showChangelogOnFirstLaunch: boolean;
    };
    state: {
      latestVersion: string | null;
      latestReleaseUrl: string | null;
      fetchedAt: string | null;
      fetchError: string | null;
    };
    override: { mode: Mode };
    detected: 'docker' | 'kubernetes' | 'standalone';
    effectiveMode: 'docker' | 'kubernetes' | 'standalone';
    buildInfo: {
      version: string;
      commit: string;
      builtAt: string;
      channel: string;
      runtime: string;
      uptime: number;
    };
  };
};

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const BEHAVIOR_OPTIONS: { value: Behavior; label: string }[] = [
  { value: 'notify', label: 'Notify' },
  { value: 'auto-download', label: 'Auto-download' },
  { value: 'auto-install', label: 'Auto-install' },
];

const SEGMENT_BASE =
  'rounded px-2.5 py-1 text-xs font-medium transition-colors';
const SEGMENT_ACTIVE = 'bg-primary text-primary-foreground';
const SEGMENT_IDLE = 'bg-muted text-muted-foreground hover:bg-muted/70';

// Update status → label + status-token classes. Solid card background with a
// status-tinted text + border (mirrors <ContentTypePill>); never translucent.
type UpdateStatus = 'current' | 'update' | 'error' | 'unknown';
const STATUS_META: Record<UpdateStatus, { label: string; cls: string }> = {
  current: { label: 'Up to date', cls: 'text-ok border-ok/40' },
  update: { label: 'Update available', cls: 'text-warn border-warn/40' },
  error: { label: 'Unknown', cls: 'text-err border-err/40' },
  unknown: { label: 'Unknown', cls: 'text-muted-foreground border-border' },
};

export function UpdatesForm({ initial }: Props): React.JSX.Element {
  const [config, setConfig] = useState(initial.config);
  const [override, setOverride] = useState(initial.override);
  const [state, setState] = useState(initial.state);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  async function patchConfig(next: Partial<typeof config>): Promise<void> {
    const merged = { ...config, ...next };
    setConfig(merged);
    const r = await apiFetch('/api/settings/updates', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!r.ok) {
      toast.error('Save failed');
      setConfig(config);
    }
  }

  async function setMode(mode: Mode): Promise<void> {
    setOverride({ mode });
    const r = await apiFetch('/api/settings/deployment-mode', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    if (!r.ok) {
      toast.error('Save failed');
    } else {
      toast.success('Deployment mode updated');
    }
  }

  async function checkNow(): Promise<void> {
    setBusy(true);
    try {
      const r = await apiFetch('/api/updates/check', { method: 'POST' });
      if (r.status === 429) {
        const body = (await r.json()) as { retryAfterSeconds: number };
        toast.warning(`Already checked recently — try again in ${body.retryAfterSeconds}s`);
        return;
      }
      if (!r.ok) {
        toast.error(`Check failed: ${await r.text()}`);
        return;
      }
      const body = (await r.json()) as { state: typeof initial.state };
      setState(body.state);
      toast.success('Update check complete');
    } finally {
      setBusy(false);
    }
  }

  const updateAvailable =
    state.latestVersion !== null && state.latestVersion !== `v${initial.buildInfo.version}`;

  const status: UpdateStatus = state.fetchError
    ? 'error'
    : updateAvailable
      ? 'update'
      : state.latestVersion !== null
        ? 'current'
        : 'unknown';

  return (
    <div className="space-y-7">
      <div className="flex justify-end">
        <Button onClick={checkNow} disabled={busy} variant="outline" size="sm">
          Check now
        </Button>
      </div>

      {updateAvailable ? (
        <Card className="space-y-3 border-primary/40 p-4">
          <div className="text-sm">
            <span className="font-medium">{state.latestVersion}</span> available
          </div>
          <div className="flex items-center gap-3">
            {state.latestReleaseUrl ? (
              <Link
                href={state.latestReleaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                Read on GitHub &rarr;
              </Link>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
              View changelog
            </Button>
          </div>
          <div className="space-y-1 border-t border-border pt-3 text-xs">
            <div className="font-medium">How to install</div>
            {initial.effectiveMode === 'docker' ? (
              <pre className="whitespace-pre-wrap break-all rounded bg-muted/30 p-2 font-mono text-xs">
                docker compose pull &amp;&amp; docker compose up -d
              </pre>
            ) : initial.effectiveMode === 'kubernetes' ? (
              <p className="text-muted-foreground">
                Update via your orchestrator (Helm, ArgoCD, kubectl set image, etc.). bookkeeprr
                does not self-install in Kubernetes.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Update method depends on how you deployed bookkeeprr. Pull the new image and restart
                your container.
              </p>
            )}
          </div>
        </Card>
      ) : null}

      <SettingsSection
        name="Release channel"
        description="Only the stable channel is selectable today. Beta and Nightly will come when versioned releases ship."
      >
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1 rounded border border-primary/40 bg-primary/5 p-3">
            <div className="text-sm font-medium">Stable</div>
            <div className="text-xs text-muted-foreground">
              Production-ready. Tagged releases on GitHub.
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-primary">
              Current
            </div>
          </div>
          <div className="space-y-1 rounded border border-border p-3 opacity-50">
            <div className="text-sm font-medium">Beta</div>
            <div className="text-xs text-muted-foreground">
              Release candidates. Help test before stable cuts.
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Coming soon
            </div>
          </div>
          <div className="space-y-1 rounded border border-border p-3 opacity-50">
            <div className="text-sm font-medium">Nightly</div>
            <div className="text-xs text-muted-foreground">
              Builds from main. Things will break.
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Coming soon
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        name="Behavior"
        description="When and how bookkeeprr checks GitHub for new releases."
      >
        <SettingRow
          label="Check for updates"
          help="How often to poll GitHub Releases."
          control={
            <div className="flex gap-1">
              {FREQUENCY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`freq-${value}`}
                  onClick={() => void patchConfig({ frequency: value })}
                  className={[
                    SEGMENT_BASE,
                    config.frequency === value ? SEGMENT_ACTIVE : SEGMENT_IDLE,
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        <div className="space-y-1">
          <SettingRow
            label="When an update is ready"
            help="What to do when a newer release is detected."
            control={
              <div className="flex gap-1">
                {BEHAVIOR_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    data-testid={`behavior-${value}`}
                    onClick={() => void patchConfig({ behavior: value })}
                    className={[
                      SEGMENT_BASE,
                      config.behavior === value ? SEGMENT_ACTIVE : SEGMENT_IDLE,
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />
          {config.behavior !== 'notify' ? (
            <p className="pl-0 text-xs text-muted-foreground">
              Auto-{config.behavior === 'auto-download' ? 'download' : 'install'} is not yet
              supported on this deployment &mdash; falls back to notify.
            </p>
          ) : null}
        </div>
        <SettingRow
          label="Show changelog on first launch"
          help='Auto-opens "What&apos;s new" once after each version bump.'
          control={
            <Switch
              checked={config.showChangelogOnFirstLaunch}
              onCheckedChange={(v) => void patchConfig({ showChangelogOnFirstLaunch: Boolean(v) })}
            />
          }
        />
        <SettingRow
          label="Notify on integrations"
          help="Post update announcements to Discord and Apprise."
          control={
            <Switch
              checked={config.notifyOnIntegrations}
              onCheckedChange={(v) => void patchConfig({ notifyOnIntegrations: Boolean(v) })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        name="Deployment mode"
        description={
          <>
            <span className="block">
              Detected: <span className="font-mono">{initial.detected}</span>
            </span>
            <span className="block">
              Effective: <span className="font-mono">{initial.effectiveMode}</span>
            </span>
          </>
        }
      >
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(['auto', 'docker', 'kubernetes'] as const).map((m) => (
              <Button
                key={m}
                variant={override.mode === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => void setMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">auto</span> detects via{' '}
            <span className="font-mono">/.dockerenv</span> and{' '}
            <span className="font-mono">KUBERNETES_SERVICE_HOST</span>.{' '}
            {initial.detected === 'standalone'
              ? 'It reads as “standalone” here because bookkeeprr isn’t running inside a recognized container orchestrator (e.g. local/dev or bare-metal). Force a mode to get the matching install instructions.'
              : 'Override only if detection is wrong.'}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        name="Build & runtime"
        description="The image bookkeeprr is currently running."
      >
        <div className="space-y-1 text-xs">
          <div className="flex gap-3">
            <span className="w-24 font-mono text-muted-foreground">VERSION</span>
            <span className="font-mono">v{initial.buildInfo.version}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-24 font-mono text-muted-foreground">COMMIT</span>
            <span className="font-mono">{initial.buildInfo.commit}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-24 font-mono text-muted-foreground">BUILT</span>
            <span className="font-mono">{initial.buildInfo.builtAt}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-24 font-mono text-muted-foreground">RUNTIME</span>
            <span className="font-mono">{initial.buildInfo.runtime}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-24 font-mono text-muted-foreground">CHANNEL</span>
            <span className="font-mono">{initial.buildInfo.channel}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-24 font-mono text-muted-foreground">UPTIME</span>
            <span className="font-mono">{formatUptime(initial.buildInfo.uptime)}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 border-t border-border pt-2">
            <span className="w-24 font-mono text-muted-foreground">STATUS</span>
            <span
              className={`inline-flex items-center rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium ${STATUS_META[status].cls}`}
              title={
                state.fetchError ??
                (status === 'unknown' ? 'No successful update check yet' : undefined)
              }
            >
              {STATUS_META[status].label}
            </span>
          </div>
          {state.fetchedAt ? (
            <div className="flex gap-3">
              <span className="w-24 font-mono text-muted-foreground">LAST CHECK</span>
              <span className="font-mono">{new Date(state.fetchedAt).toLocaleString()}</span>
            </div>
          ) : null}
        </div>
      </SettingsSection>

      <VersionHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
