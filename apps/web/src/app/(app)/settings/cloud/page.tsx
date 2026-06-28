import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { CLOUD_FEATURES_ENABLED } from '@/lib/features';
import { cloudSettings } from '@/server/db/settings/cloud';
import { PageHeader } from '@/components/shell/PageHeader';
import { CloudSettingsForm } from './CloudSettingsForm';

export const dynamic = 'force-dynamic';

export default async function CloudSettingsPage(): Promise<React.JSX.Element> {
  if (!CLOUD_FEATURES_ENABLED) redirect('/settings');
  const actor = await getActor();
  if (!actor || actor.role !== 'admin') redirect('/');

  const cfg = await cloudSettings.get();
  // Don't leak the cached access token to the client.
  const safeCfg = {
    enabled: cfg.enabled,
    cloudBaseUrl: cfg.cloudBaseUrl,
    tenantId: cfg.tenantId,
    installUuid: cfg.installUuid,
    acceptedEulaVersion: cfg.acceptedEulaVersion,
    acceptedPrivacyVersion: cfg.acceptedPrivacyVersion,
    acceptedAt: cfg.acceptedAt,
    lastRegisterError: cfg.lastRegisterError,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cloud connection"
        subtitle="Opt in to the optional Bookkeeprr cloud service. Required for mobile push notifications. Your installation receives a tenant ID that scopes all cloud-side data; you can disconnect (and have all cloud-held data deleted) at any time."
      />
      <CloudSettingsForm initial={safeCfg} />
    </div>
  );
}
