'use client';

import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/shell/SettingsSection';
import type { CloudSettingsView } from './CloudSettingsForm';

export function OffStatePanel({
  cfg,
  onConnect,
}: {
  cfg: CloudSettingsView;
  onConnect: () => void;
}): React.JSX.Element {
  return (
    <SettingsSection
      name="Connection"
      description="The cloud service is currently disabled. Bookkeeprr remains fully functional without it — only the push channel and remote device-targeted features depend on it."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-muted-foreground/50" />
          <span className="text-[13.5px] font-medium text-foreground">Not connected</span>
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex gap-3">
            <span className="w-32 font-mono text-muted-foreground">CLOUD URL</span>
            <span className="font-mono">{cfg.cloudBaseUrl}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-32 font-mono text-muted-foreground">INSTALL UUID</span>
            <span className="font-mono">{cfg.installUuid}</span>
          </div>
          {cfg.lastRegisterError ? (
            <div className="pt-1 text-destructive">Last error: {cfg.lastRegisterError}</div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button onClick={onConnect}>Connect to cloud</Button>
        </div>
      </div>
    </SettingsSection>
  );
}
