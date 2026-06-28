'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import { CloudDisconnectModal } from './CloudDisconnectModal';
import { StatusPanel } from './StatusPanel';
import { OffStatePanel } from './OffStatePanel';

export type CloudSettingsView = {
  enabled: boolean;
  cloudBaseUrl: string;
  tenantId: string | null;
  installUuid: string;
  acceptedEulaVersion: string | null;
  acceptedPrivacyVersion: string | null;
  acceptedAt: string | null;
  lastRegisterError: string | null;
};

export function CloudSettingsForm({ initial }: { initial: CloudSettingsView }): React.JSX.Element {
  const router = useRouter();
  const [cfg, setCfg] = useState<CloudSettingsView>(initial);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  async function refresh(): Promise<void> {
    const r = await apiFetch('/api/settings/cloud');
    if (r.ok) {
      const body = (await r.json()) as { config: CloudSettingsView };
      setCfg(body.config);
    }
  }

  async function handleDisconnect(): Promise<boolean> {
    const r = await apiFetch('/api/settings/cloud/disconnect', { method: 'POST' });
    if (!r.ok) {
      const errBody = (await r.json().catch(() => ({ message: 'Disconnect failed' }))) as {
        message?: string;
      };
      toast.error(errBody.message ?? 'Disconnect failed');
      return false;
    }
    toast.success('Disconnected from cloud');
    setDisconnectOpen(false);
    await refresh();
    return true;
  }

  return (
    <div className="space-y-4">
      {cfg.enabled && cfg.tenantId ? (
        <>
          <StatusPanel cfg={cfg} onDisconnect={() => setDisconnectOpen(true)} />
          <CloudDisconnectModal
            open={disconnectOpen}
            onClose={() => setDisconnectOpen(false)}
            onConfirm={handleDisconnect}
          />
        </>
      ) : (
        <OffStatePanel cfg={cfg} onConnect={() => router.push('/settings/cloud/connect')} />
      )}
    </div>
  );
}
