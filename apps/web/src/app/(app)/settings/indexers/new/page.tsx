import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { IndexerForm } from '../IndexerForm';

export const dynamic = 'force-dynamic';

export default async function NewIndexerPage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/indexers/new');
  if (actor.role !== 'admin') redirect('/settings');

  return <IndexerForm mode="create" />;
}
