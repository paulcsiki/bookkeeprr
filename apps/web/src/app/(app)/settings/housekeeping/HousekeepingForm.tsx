'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { SettingsSection } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import type { JobRetention, BackupRetention } from '@/server/db/settings/housekeeping';
import type { VisibilityRetention } from '@/server/db/settings/visibility-retention';
import type { ReleaseRetention } from '@/server/db/settings/release-retention';

export type HousekeepingInitial = {
  jobs: JobRetention;
  backups: BackupRetention;
  visibility: VisibilityRetention;
  releases: ReleaseRetention;
};

type Section = 'jobs' | 'backups' | 'visibility' | 'releases';

export function HousekeepingForm({ initial }: { initial: HousekeepingInitial }): React.JSX.Element {
  const [jobs, setJobs] = useState<JobRetention>(initial.jobs);
  const [backups, setBackups] = useState<BackupRetention>(initial.backups);
  const [visibility, setVisibility] = useState<VisibilityRetention>(initial.visibility);
  const [releases, setReleases] = useState<ReleaseRetention>(initial.releases);
  // Saved baseline per section; re-set on each section's successful save.
  const [saved, setSaved] = useState<HousekeepingInitial>(initial);
  const [pending, startTransition] = useTransition();

  const dirty =
    JSON.stringify(jobs) !== JSON.stringify(saved.jobs) ||
    JSON.stringify(backups) !== JSON.stringify(saved.backups) ||
    JSON.stringify(visibility) !== JSON.stringify(saved.visibility) ||
    JSON.stringify(releases) !== JSON.stringify(saved.releases);
  useUnsavedChanges(dirty);

  async function saveSection<T>(
    section: Section,
    body: T,
    apply: (next: T) => void,
  ): Promise<void> {
    startTransition(async () => {
      try {
        const r = await apiFetch(`/api/settings/housekeeping/${section}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const text = await r.text();
          toast.error(`Save failed (${r.status}): ${text}`);
          return;
        }
        const data = (await r.json()) as { config: T };
        apply(data.config);
        // Re-baseline only the saved section so dirty recomputes correctly.
        // Section names map 1:1 onto HousekeepingInitial keys.
        setSaved((s) => ({ ...s, [section]: data.config }));
        toast.success(`Saved ${section} retention`);
      } catch (err) {
        toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <div className="space-y-7">
      <SettingsSection
        name="Jobs"
        description="How long to keep completed and failed background-job rows."
      >
        <div className="space-y-3">
          <Field htmlFor="hk-jobs-terminal" label="Terminal days (completed)">
            <Input
              id="hk-jobs-terminal"
              type="number"
              min={1}
              max={3650}
              value={jobs.terminalDays}
              onChange={(e) => setJobs({ ...jobs, terminalDays: Number(e.currentTarget.value) })}
            />
          </Field>
          <Field htmlFor="hk-jobs-error" label="Error days (failed)">
            <Input
              id="hk-jobs-error"
              type="number"
              min={1}
              max={3650}
              value={jobs.errorDays}
              onChange={(e) => setJobs({ ...jobs, errorDays: Number(e.currentTarget.value) })}
            />
          </Field>
          <Button onClick={() => saveSection('jobs', jobs, setJobs)} disabled={pending}>
            {pending ? 'Saving…' : 'Save jobs'}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        name="Database backups"
        description={
          <>
            Daily snapshots in &lt;CONFIG_DIR&gt;/backups. Monthly-day-1 snapshots are kept
            separately.
          </>
        }
      >
        <div className="space-y-3">
          <Field htmlFor="hk-backups-daily" label="Daily kept (0 disables)">
            <Input
              id="hk-backups-daily"
              type="number"
              min={0}
              max={365}
              value={backups.daily}
              onChange={(e) => setBackups({ ...backups, daily: Number(e.currentTarget.value) })}
            />
          </Field>
          <Field htmlFor="hk-backups-monthly" label="Monthly day-1 kept (0 disables)">
            <Input
              id="hk-backups-monthly"
              type="number"
              min={0}
              max={365}
              value={backups.monthlyDay1}
              onChange={(e) =>
                setBackups({ ...backups, monthlyDay1: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Button onClick={() => saveSection('backups', backups, setBackups)} disabled={pending}>
            {pending ? 'Saving…' : 'Save backups'}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        name="Audit + logs"
        description="Retention for audit_events rows and rotated bookkeeprr log files."
      >
        <div className="space-y-3">
          <Field htmlFor="hk-vis-audit" label="Audit event retention (days)">
            <Input
              id="hk-vis-audit"
              type="number"
              min={1}
              max={3650}
              value={visibility.auditRetentionDays}
              onChange={(e) =>
                setVisibility({
                  ...visibility,
                  auditRetentionDays: Number(e.currentTarget.value),
                })
              }
            />
          </Field>
          <Field htmlFor="hk-vis-logs" label="Log file retention (days)">
            <Input
              id="hk-vis-logs"
              type="number"
              min={1}
              max={365}
              value={visibility.logRetentionDays}
              onChange={(e) =>
                setVisibility({
                  ...visibility,
                  logRetentionDays: Number(e.currentTarget.value),
                })
              }
            />
          </Field>
          <Button
            onClick={() => saveSection('visibility', visibility, setVisibility)}
            disabled={pending}
          >
            {pending ? 'Saving…' : 'Save audit + logs'}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        name="Releases"
        description="Old releases get pruned by age unless they're in the top-N scored per series or referenced by a download."
      >
        <div className="space-y-3">
          <Field htmlFor="hk-rel-keep" label="Keep top-N per series">
            <Input
              id="hk-rel-keep"
              type="number"
              min={0}
              max={10000}
              value={releases.keepPerSeries}
              onChange={(e) =>
                setReleases({ ...releases, keepPerSeries: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Field htmlFor="hk-rel-age" label="Older-than (days)">
            <Input
              id="hk-rel-age"
              type="number"
              min={1}
              max={3650}
              value={releases.olderThanDays}
              onChange={(e) =>
                setReleases({ ...releases, olderThanDays: Number(e.currentTarget.value) })
              }
            />
          </Field>
          <Button onClick={() => saveSection('releases', releases, setReleases)} disabled={pending}>
            {pending ? 'Saving…' : 'Save releases'}
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
