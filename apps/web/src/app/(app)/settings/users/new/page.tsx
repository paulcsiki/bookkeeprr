import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { CreateUserForm } from '../CreateUserForm';

export const dynamic = 'force-dynamic';

export default async function NewUserPage(): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/settings/users/new');
  if (actor.role !== 'admin') redirect('/settings');

  return <CreateUserForm />;
}
