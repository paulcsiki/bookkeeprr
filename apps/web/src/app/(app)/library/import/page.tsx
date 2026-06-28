import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { ImportGridView } from './ImportGridView';

export const dynamic = 'force-dynamic';

export default async function LibraryImportPage(): Promise<React.JSX.Element> {
  const jar = await cookies();
  const token = jar.get('bookkeeprr_session')?.value ?? null;
  if (token === null) redirect('/login?next=/library/import');
  const session = await getSessionByToken(token);
  if (session === null) redirect('/login?next=/library/import');
  const user = await getUser(session.userId);
  if (user === null || user.disabled) redirect('/login?next=/library/import');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Library Import
        </h1>
        <p className="text-sm text-muted-foreground max-w-[720px]">
          Review untracked files found on disk. Confirm the metadata match and
          quality profile for each item, then click Import to add them to your
          library.
        </p>
      </div>
      <ImportGridView />
    </div>
  );
}
