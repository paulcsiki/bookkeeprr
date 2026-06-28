import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser, listUsers } from '@/server/db/users';
import { PageHeader } from '@/components/shell/PageHeader';
import { UsersList } from './UsersList';

export const dynamic = 'force-dynamic';

export default async function UsersSettingsPage(): Promise<React.JSX.Element> {
  const jar = await cookies();
  const token = jar.get('bookkeeprr_session')?.value ?? null;
  if (token === null) redirect('/login?next=/settings/users');
  const session = await getSessionByToken(token);
  if (session === null) redirect('/login?next=/settings/users');
  const user = await getUser(session.userId);
  if (user === null || user.role !== 'admin') redirect('/settings');

  const users = await listUsers();
  const safeUsers = users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName ?? null,
    // Custom avatar served via the avatar endpoint; null falls back to initials.
    avatarUrl: u.avatarPath != null ? `/api/auth/me/avatar/${u.id}` : null,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    disabled: u.disabled,
    authSource: u.authSource,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
    lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage user accounts. The first admin cannot be deleted or disabled while it's the only active admin."
      />
      <UsersList initial={safeUsers} currentUserId={user.id} />
    </div>
  );
}
