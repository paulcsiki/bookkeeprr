'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SettingsSection, SettingRow } from '@/components/shell/SettingsSection';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import type { AutoGrabConfig } from '@/server/db/settings/auto-grab';

export function AutoGrabForm({ initial }: { initial: AutoGrabConfig }): React.JSX.Element {
  const [saved, setSaved] = useState<AutoGrabConfig>(initial);
  const [config, setConfig] = useState<AutoGrabConfig>(initial);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  useUnsavedChanges(dirty);

  function save(): void {
    startTransition(async () => {
      try {
        const r = await apiFetch('/api/settings/auto-grab', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(config),
        });
        if (!r.ok) {
          const text = await r.text();
          toast.error(`Save failed (${r.status}): ${text}`);
          return;
        }
        const data = (await r.json()) as { config: AutoGrabConfig };
        setConfig(data.config);
        setSaved(data.config);
        toast.success('Saved auto-grab settings');
      } catch (err) {
        toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <div className="space-y-7">
      <SettingsSection
        name="Dry-run mode"
        description={
          <>
            When enabled, auto-grab logs what it would do via audit events at{' '}
            <code>/settings/audit</code> (action <code>auto_grab.dry_run_decision</code>) without
            actually calling qBittorrent.
          </>
        }
      >
        <SettingRow
          label="Enable dry-run mode"
          control={
            <Checkbox
              id="ag-dryrun"
              checked={config.dryRun}
              onCheckedChange={(v) => setConfig({ ...config, dryRun: Boolean(v) })}
            />
          }
        />
        <div className="pt-4">
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
