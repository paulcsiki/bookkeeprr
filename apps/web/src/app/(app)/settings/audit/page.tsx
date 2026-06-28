import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { queryAuditEvents } from '@/server/db/audit';
import { PageHeader } from '@/components/shell/PageHeader';
import { AuditEventsTable } from './AuditEventsTable';

export const dynamic = 'force-dynamic';

export default async function SettingsAuditPage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/audit');
  if (actor.role !== 'admin') redirect('/settings');

  const { rows, total } = await queryAuditEvents({}, { limit: 10000, offset: 0 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        subtitle="Append-only record of auth events and admin operations. Pruned automatically by housekeeping."
      />
      <AuditEventsTable initialRows={rows} initialTotal={total} />
    </div>
  );
}
