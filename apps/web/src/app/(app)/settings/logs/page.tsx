import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { listLogFiles } from '@/server/audit/log-files';
import { PageHeader } from '@/components/shell/PageHeader';
import { LogFilesViewer } from './LogFilesViewer';

export const dynamic = 'force-dynamic';

export default async function SettingsLogsPage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/logs');
  if (actor.role !== 'admin') redirect('/settings');

  const files = await listLogFiles();

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <PageHeader
        title="Logs"
        subtitle="Daily-rotated log files written by bookkeeprr. Pruned automatically by housekeeping."
      />
      <LogFilesViewer initialFiles={files} />
    </div>
  );
}
