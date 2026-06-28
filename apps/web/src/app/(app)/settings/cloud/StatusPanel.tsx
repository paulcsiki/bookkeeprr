'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsSection } from '@/components/shell/SettingsSection';
import type { CloudSettingsView } from './CloudSettingsForm';

export function StatusPanel({
  cfg,
  onDisconnect,
}: {
  cfg: CloudSettingsView;
  onDisconnect: () => void;
}): React.JSX.Element {
  return (
    <SettingsSection
      name="Connection"
      description="This installation is registered with the Bookkeeprr cloud service. Push notifications and remote device features are enabled."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge>active</Badge>
          <span className="text-[13.5px] font-medium text-foreground">Connected</span>
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex gap-3">
            <span className="w-32 font-mono text-muted-foreground">TENANT ID</span>
            <span className="font-mono">{cfg.tenantId ?? '—'}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-32 font-mono text-muted-foreground">INSTALL UUID</span>
            <span className="font-mono">{cfg.installUuid}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-32 font-mono text-muted-foreground">CLOUD URL</span>
            <span className="font-mono">{cfg.cloudBaseUrl}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-32 font-mono text-muted-foreground">EULA VERSION</span>
            <span className="font-mono">{cfg.acceptedEulaVersion ?? '—'}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-32 font-mono text-muted-foreground">PRIVACY VERSION</span>
            <span className="font-mono">{cfg.acceptedPrivacyVersion ?? '—'}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-32 font-mono text-muted-foreground">ACCEPTED AT</span>
            <span className="font-mono">{cfg.acceptedAt ?? '—'}</span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="destructive" onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
