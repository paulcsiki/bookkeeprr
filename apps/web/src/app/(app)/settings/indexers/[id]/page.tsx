import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { IndexerForm } from '../IndexerForm';

export const dynamic = 'force-dynamic';

export default async function EditIndexerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const actor = await getActor();
  if (actor === null) redirect(`/login?next=/settings/indexers/${id}`);
  if (actor.role !== 'admin') redirect('/settings');

  return <IndexerForm mode="edit" id={Number(id)} />;
}
