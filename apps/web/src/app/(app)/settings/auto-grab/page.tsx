import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { autoGrabSetting } from '@/server/db/settings/auto-grab';
import { PageHeader } from '@/components/shell/PageHeader';
import { AutoGrabForm } from './AutoGrabForm';

export const dynamic = 'force-dynamic';

export default async function SettingsAutoGrabPage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/auto-grab');
  if (actor.role !== 'admin') redirect('/settings');

  const initial = await autoGrabSetting.get();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto-grab"
        subtitle="When dry-run is enabled, auto-grab decisions are logged as audit events but the qBittorrent add is skipped. Use this to preview what would be grabbed while tuning quality profiles or scoring weights."
      />
      <AutoGrabForm initial={initial} />
    </div>
  );
}
