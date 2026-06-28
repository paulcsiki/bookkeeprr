import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { loadProfileData } from './data';
import {
  ProfileHeader,
  CurrentlyReading,
  ActivityTimeline,
  ProfileFormat,
  ProfileTrend,
  ProfileHeatmap,
  FinishedShelf,
  MemberStrip,
} from './ProfileSections';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<React.JSX.Element> {
  const { userId: rawId } = await params;
  const next = `/profile/${rawId}`;

  const jar = await cookies();
  const token = jar.get('bookkeeprr_session')?.value ?? null;
  if (token === null) redirect(`/login?next=${next}`);
  const session = await getSessionByToken(token);
  if (session === null) redirect(`/login?next=${next}`);
  const viewer = await getUser(session.userId);
  if (viewer === null || viewer.disabled) redirect(`/login?next=${next}`);

  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId <= 0) notFound();

  const data = await loadProfileData(userId, viewer.id);
  if (data === null) notFound();

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-[22px] pb-8">
      {/* top bar: back to dashboard + member switcher */}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/dashboard"
          className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground"
        >
          <ChevronLeft className="size-[15px]" aria-hidden /> Dashboard
        </Link>
        <MemberStrip members={data.members} currentId={data.member.id} />
      </div>

      <ProfileHeader data={data} />

      <div className="grid items-start gap-[22px] lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-[22px]">
          <CurrentlyReading
            items={data.continueItems}
            name={data.member.name}
            isYou={data.isYou}
          />
          <ActivityTimeline items={data.activity} />
        </div>
        <div className="flex flex-col gap-[22px]">
          <ProfileFormat data={data} />
          <ProfileTrend data={data} />
        </div>
      </div>

      <ProfileHeatmap data={data} />
      <FinishedShelf items={data.finished} />
    </div>
  );
}
