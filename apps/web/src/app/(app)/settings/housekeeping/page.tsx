import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { jobRetentionSetting, backupRetentionSetting } from '@/server/db/settings/housekeeping';
import { visibilityRetentionSetting } from '@/server/db/settings/visibility-retention';
import { releaseRetentionSetting } from '@/server/db/settings/release-retention';
import { PageHeader } from '@/components/shell/PageHeader';
import { HousekeepingForm } from './HousekeepingForm';

export const dynamic = 'force-dynamic';

export default async function SettingsHousekeepingPage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/housekeeping');
  if (actor.role !== 'admin') redirect('/settings');

  const [jobs, backups, visibility, releases] = await Promise.all([
    jobRetentionSetting.get(),
    backupRetentionSetting.get(),
    visibilityRetentionSetting.get(),
    releaseRetentionSetting.get(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Housekeeping"
        subtitle="Retention policies applied by the daily 03:00 housekeeping job. Changes take effect on the next run."
      />
      <HousekeepingForm initial={{ jobs, backups, visibility, releases }} />
    </div>
  );
}
