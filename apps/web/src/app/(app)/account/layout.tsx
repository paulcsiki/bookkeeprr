import { redirect } from 'next/navigation';
import { getActor } from '@/server/auth/get-actor';
import { AccountNav } from './components/AccountNav';

export const dynamic = 'force-dynamic';

/**
 * Two-column account shell: a left rail of section routes + the content pane.
 * The frame is pinned to the viewport height and only the content pane scrolls,
 * so the border and nav stay put. Wraps every /account/* route.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const actor = await getActor();
  if (actor === null) redirect('/login?next=/account');

  return (
    <div className="flex h-[calc(100dvh-104px)] overflow-hidden rounded-xl border border-border bg-background">
      <div className="w-[220px] shrink-0 overflow-y-auto border-r border-border bg-card p-3">
        <AccountNav />
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-7 md:px-8">{children}</div>
    </div>
  );
}
