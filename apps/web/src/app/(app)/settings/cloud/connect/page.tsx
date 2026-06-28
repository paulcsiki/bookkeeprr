import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { CLOUD_FEATURES_ENABLED } from '@/lib/features';
import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudConnectForm } from '../CloudConnectForm';

export const dynamic = 'force-dynamic';

export default async function CloudConnectPage(): Promise<React.JSX.Element> {
  if (!CLOUD_FEATURES_ENABLED) redirect('/settings');
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/cloud/connect');
  if (actor.role !== 'admin') redirect('/settings');

  const cfg = await cloudSettings.get();
  // Already connected: the connect form is meaningless (and re-POSTing would hit
  // a duplicate-registration error). Bounce back to the status page. This mirrors
  // the old modal, which was only reachable from OffStatePanel (disconnected state).
  if (cfg.enabled && cfg.tenantId !== null) redirect('/settings/cloud');

  return <CloudConnectForm cloudBaseUrl={cfg.cloudBaseUrl} />;
}
