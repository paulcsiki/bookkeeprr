import { Users } from 'lucide-react';
import type { ContentType } from '@bookkeeprr/types';
import Link from 'next/link';
import { Avatar, colorFromSeed } from '@bookkeeprr/ui';
import { Card, CardHead, relativeTime } from '@/components/dashboard';
import { Cover } from '@/components/Cover';
import { WidgetEmpty } from './WidgetEmpty';
import type { ActivityFeedItem } from '@/server/db/activity-events';

/** A resolved actor for a feed row (the user, or "system" for job events). */
export type FeedActor = { name: string; avatarUrl: string | null } | null;

const VERB: Record<string, { v: string; tone: string }> = {
  finished: { v: 'finished', tone: '--color-ok' },
  started: { v: 'started reading', tone: '--color-info' },
  added: { v: 'added', tone: '--color-primary' },
  imported: { v: 'imported', tone: '--color-primary' },
  grabbed: { v: 'grabbed', tone: '--color-warn' },
  moved: { v: 'moved to group', tone: '--color-primary' },
};

type Props = {
  items: ActivityFeedItem[];
  /** Resolve each event's userId to a display name + avatar (null = system). */
  actorFor: (userId: number | null) => FeedActor;
  /** True when the household has more than one member. */
  multiMember: boolean;
};

/**
 * Household activity feed: avatar + "X verb Y" + relative time + a mini cover per
 * event. Null-user (job) events render as "system" with no avatar. Empty feed
 * shows the no-activity prompt (solo servers get an "Invite members" CTA).
 */
export function FeedWidget({ items, actorFor, multiMember }: Props): React.JSX.Element {
  return (
    <Card fill>
      <CardHead
        icon={Users}
        title="Household activity"
        action={
          items.length > 0 ? (
            <Link href="/activity" className="text-[12.5px] font-medium text-primary">
              See all →
            </Link>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <WidgetEmpty
          icon={<Users />}
          title="No recent activity"
          body={
            multiMember
              ? 'When household members read, finish, or add titles, it shows up here.'
              : 'When you read, finish, or add titles, it shows up here.'
          }
          secondary={multiMember ? undefined : { label: 'Invite members', href: '/settings/users' }}
          minHeight={184}
        />
      ) : (
        <div className="flex flex-col">
          {items.map((it, i) => {
            const actor = actorFor(it.userId);
            const name = actor?.name ?? 'System';
            const verb = VERB[it.kind] ?? { v: it.kind, tone: '--color-muted-foreground' };
            const title = it.seriesTitle ?? 'a title';
            return (
              <div
                key={it.id}
                className={`flex items-center gap-3 py-[9px] ${i ? 'border-t border-border' : ''}`}
              >
                {actor ? (
                  <a href={`/profile/${it.userId}`} className="shrink-0">
                    <Avatar
                      email={name}
                      name={name}
                      size={32}
                      avatarUrl={actor.avatarUrl}
                      variant={colorFromSeed(name)}
                    />
                  </a>
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-elevated">
                    <Users className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug text-foreground/80">
                    <span className="font-semibold text-foreground">{name}</span>{' '}
                    <span style={{ color: `var(${verb.tone})` }}>{verb.v}</span>{' '}
                    <span className="font-medium text-foreground">{title}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[9.5px] tracking-[0.04em] text-muted-foreground">
                    {relativeTime(it.createdAt)}
                  </div>
                </div>
                {it.contentType && (
                  <div className="aspect-[2/3] w-[30px] shrink-0 overflow-hidden rounded border border-border bg-muted">
                    <Cover
                      className="size-full"
                      src={it.coverUrl}
                      contentType={it.contentType as ContentType}
                      title={it.seriesTitle}
                      alt=""
                      hideType
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
