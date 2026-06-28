/**
 * Presentational sections for the read-only member profile dossier. All
 * server-rendered, token-only styling, reusing the shared dashboard primitives
 * (Card, StatTile, Donut, TrendLine, Heatmap, MiniBook) and the `@bookkeeprr/ui`
 * Avatar / EmptyState. Interactive bits are plain anchors (navigation only).
 */

import Link from 'next/link';
import {
  Activity,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Flame,
  Grid3x3,
  Heart,
  Trophy,
} from 'lucide-react';
import type { ContentType } from '@bookkeeprr/types';
import {
  Avatar,
  colorFromSeed,
  CONTENT_TYPE_VAR,
  CONTENT_TYPE_LABEL,
  EmptyState,
} from '@bookkeeprr/ui';
import {
  Card,
  CardHead,
  SectionHead,
  StatTile,
  Donut,
  TrendLine,
  Heatmap,
  MiniBook,
  compactNum,
  fmtHrs,
  fmtMins,
  relativeTime,
  type DonutSegment,
} from '@/components/dashboard';
import { Cover } from '@/components/Cover';
import type {
  ProfileData,
  ProfileContinueItem,
  ProfileFinishedItem,
  ProfileMember,
} from './data';
import type { ActivityFeedItem } from '@/server/db/activity-events';

const TYPE_ORDER: ContentType[] = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'];

// Verb tone + label per activity kind, matching the dashboard feed.
const VERB: Record<string, { v: string; tone: string }> = {
  finished: { v: 'finished', tone: '--color-ok' },
  started: { v: 'started reading', tone: '--color-info' },
  added: { v: 'added', tone: '--color-primary' },
  imported: { v: 'imported', tone: '--color-primary' },
  grabbed: { v: 'grabbed', tone: '--color-warn' },
  moved: { v: 'moved to group', tone: '--color-primary' },
};

function volumeLabel(
  contentType: ContentType,
  volumeNumber: number | null,
  volumeTitle: string | null,
): string | null {
  if (volumeTitle) return volumeTitle;
  if (volumeNumber != null) {
    const unit = contentType === 'comic' ? 'Issue' : 'Vol.';
    return `${unit} ${volumeNumber}`;
  }
  return null;
}

/** First word of a name (the strip + possessive copy use it). */
function firstName(name: string): string {
  const t = name.trim();
  return t.length === 0 ? name : t.split(/\s+/)[0]!;
}

// ── header ───────────────────────────────────────────────────
export function ProfileHeader({ data }: { data: ProfileData }): React.JSX.Element {
  const { member, stats, serverRank, memberCount, isYou } = data;
  const hours = fmtHrs(stats.minutes);
  return (
    <Card flush className="overflow-hidden">
      {/* gradient banner — tinted from the single themable accent */}
      <div
        className="relative h-24"
        style={{
          background:
            'linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 45%, var(--color-card)), var(--color-card) 70%)',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(115deg, transparent 0 22px, color-mix(in srgb, var(--color-foreground) 4%, transparent) 22px 23px)',
          }}
        />
      </div>
      <div className="relative -mt-11 px-6 pb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="rounded-full" style={{ boxShadow: '0 0 0 4px var(--color-card)' }}>
            <Avatar
              email={member.avatarSeed}
              name={member.name}
              size={84}
              avatarUrl={member.avatarUrl}
              variant={colorFromSeed(member.avatarSeed)}
            />
          </div>
          <div className="min-w-[200px] flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-[26px] font-semibold tracking-[-0.025em]">
                {member.name}
              </h1>
              {isYou && (
                <span className="rounded-full border border-primary/40 px-[7px] py-0.5 font-mono text-[9px] tracking-[0.1em] text-primary">
                  YOU
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] ${
                  member.isAdmin
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-elevated text-muted-foreground'
                }`}
              >
                {member.roleLabel}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3.5 font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden /> Joined {member.joinedLabel}
              </span>
              {member.favType && (
                <span className="inline-flex items-center gap-1.5">
                  <Heart
                    className="size-3.5"
                    style={{ color: `var(${CONTENT_TYPE_VAR[member.favType]})` }}
                    aria-hidden
                  />{' '}
                  Loves {CONTENT_TYPE_LABEL[member.favType]}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="size-3.5" aria-hidden /> {compactNum(stats.booksFinished)} read
              </span>
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total time" value={compactNum(hours)} unit="hours" icon={Activity} />
          <StatTile label="Finished" value={stats.booksFinished} unit="books" icon={CheckCircle2} />
          <StatTile
            label="Streak"
            value={stats.streakDays}
            unit="days"
            icon={Flame}
            accentVar="--color-warn"
          />
          <StatTile
            label="Server rank"
            value={`#${serverRank}`}
            unit={`of ${memberCount}`}
            icon={Trophy}
            accentVar="--color-rank-gold"
          />
        </div>
      </div>
    </Card>
  );
}

// ── currently reading ────────────────────────────────────────
export function CurrentlyReading({
  items,
  name,
  isYou,
}: {
  items: ProfileContinueItem[];
  name: string;
  isYou: boolean;
}): React.JSX.Element {
  const title = isYou ? 'You’re reading' : `${firstName(name)} is reading`;
  return (
    <Card>
      <CardHead icon={BookOpen} title={title} accentVar="--color-primary" />
      {items.length === 0 ? (
        <InCardEmpty
          icon={<BookOpen />}
          title="Nothing in progress"
          body={isYou ? 'Open a title to start reading.' : 'No titles in progress right now.'}
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          {items.map((b) => (
            <Link
              key={b.readableKey}
              href={`/library/${b.seriesId}`}
              className="flex items-center gap-3"
            >
              <div className="aspect-[2/3] w-[46px] shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                <Cover
                  className="size-full"
                  src={b.coverUrl}
                  contentType={b.contentType}
                  title={b.title}
                  alt=""
                  hideType
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-foreground">{b.title}</div>
                {(() => {
                  const vl = volumeLabel(b.contentType, b.volumeNumber, b.volumeTitle);
                  return vl ? (
                    <div className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{vl}</div>
                  ) : null;
                })()}
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${b.pct}%`,
                        background: `var(${CONTENT_TYPE_VAR[b.contentType]})`,
                      }}
                    />
                  </div>
                  <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                    {b.pct}%
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── activity timeline ────────────────────────────────────────
export function ActivityTimeline({
  items,
}: {
  items: ActivityFeedItem[];
}): React.JSX.Element {
  return (
    <Card>
      <CardHead icon={Activity} title="Recent activity" />
      {items.length === 0 ? (
        <InCardEmpty
          icon={<Activity />}
          title="No activity yet"
          body="Reading, finishing, and adding titles will show up here."
        />
      ) : (
        <div className="relative">
          <div className="absolute bottom-1.5 left-[15px] top-1.5 w-px bg-border" />
          <div className="flex flex-col gap-0.5">
            {items.map((a) => {
              const verb = VERB[a.kind] ?? { v: a.kind, tone: '--color-muted-foreground' };
              const title = a.seriesTitle ?? 'a title';
              return (
                <div key={a.id} className="relative flex gap-3.5 py-2">
                  <div className="flex w-8 shrink-0 justify-center">
                    <span
                      className="z-[1] grid size-[26px] place-items-center rounded-full"
                      style={{
                        background: `color-mix(in srgb, var(${verb.tone}) 13%, transparent)`,
                        border: `1px solid color-mix(in srgb, var(${verb.tone}) 34%, transparent)`,
                      }}
                    >
                      <span
                        className="size-[7px] rounded-full"
                        style={{ background: `var(${verb.tone})` }}
                      />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="text-[13px] leading-snug text-foreground/80">
                      <span className="capitalize" style={{ color: `var(${verb.tone})` }}>
                        {verb.v}
                      </span>{' '}
                      {a.seriesId != null ? (
                        <Link href={`/library/${a.seriesId}`} className="font-medium text-foreground">
                          {title}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">{title}</span>
                      )}
                      {a.contentType &&
                        (() => {
                          const vl = volumeLabel(a.contentType, a.volumeNumber, a.volumeTitle);
                          return vl ? (
                            <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                              {' '}
                              {vl}
                            </span>
                          ) : null;
                        })()}
                    </div>
                    <div className="mt-0.5 font-mono text-[9.5px] tracking-[0.04em] text-muted-foreground">
                      {relativeTime(a.createdAt)}
                    </div>
                  </div>
                  {a.contentType && (
                    <div className="aspect-[2/3] w-[26px] shrink-0 overflow-hidden rounded border border-border bg-muted">
                      <Cover
                        className="size-full"
                        src={a.coverUrl}
                        contentType={a.contentType as ContentType}
                        title={a.seriesTitle}
                        alt=""
                        hideType
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── format donut (all time) ──────────────────────────────────
export function ProfileFormat({ data }: { data: ProfileData }): React.JSX.Element {
  const segments: DonutSegment[] = TYPE_ORDER.map((type) => ({
    type,
    value: data.format.byType[type] ?? 0,
  }));
  const hours = fmtHrs(data.format.totalMinutes);
  const empty = data.format.totalMinutes <= 0;
  return (
    <Card>
      <CardHead icon={Grid3x3} title="By format · all time" />
      <Donut
        segments={segments}
        size={150}
        thickness={20}
        centerLabel={<span className={empty ? 'text-muted-foreground' : undefined}>{hours}</span>}
        centerSub="HOURS"
      />
    </Card>
  );
}

// ── 12-week trend ────────────────────────────────────────────
const TREND_LABELS = ['12w', '', '', '', '8w', '', '', '', '4w', '', '', 'now'];

export function ProfileTrend({ data }: { data: ProfileData }): React.JSX.Element {
  const weekMins = data.trend[data.trend.length - 1] ?? 0;
  const wk = fmtMins(weekMins);
  return (
    <Card>
      <CardHead
        icon={Activity}
        title="12-week trend"
        action={
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {wk.v}
            {wk.u}/wk
          </span>
        }
      />
      <TrendLine
        points={data.trend}
        labels={TREND_LABELS}
        valueLabels={data.trend.map((m) => {
          const f = fmtMins(m);
          return f.u ? `${f.v}${f.u}` : f.v;
        })}
        height={118}
      />
    </Card>
  );
}

// ── contribution heatmap ─────────────────────────────────────
export function ProfileHeatmap({ data }: { data: ProfileData }): React.JSX.Element {
  return (
    <Card>
      <CardHead
        icon={Flame}
        title="Reading activity · last year"
        accentVar="--color-warn"
        action={
          <div className="flex gap-4 font-mono text-[10.5px] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{data.activeDays}</span> active days
            </span>
            <span>
              <span className="font-medium text-warn">{data.stats.streakDays}</span> current
            </span>
            <span>
              <span className="font-medium text-foreground">{data.longestStreak}</span> longest
            </span>
          </div>
        }
      />
      <Heatmap days={data.heatmap} cell={13} gap={3} />
    </Card>
  );
}

// ── recently finished shelf ──────────────────────────────────
export function FinishedShelf({
  items,
}: {
  items: ProfileFinishedItem[];
}): React.JSX.Element {
  return (
    <section>
      <SectionHead icon={CheckCircle2} title="Recently finished" />
      {items.length === 0 ? (
        <Card>
          <InCardEmpty
            icon={<CheckCircle2 />}
            title="No finished titles yet"
            body="Completed books will line up here."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-8">
          {items.map((b) => (
            <div key={b.readableKey} className="flex min-w-0 flex-col gap-1">
              <MiniBook
                item={{ title: b.title, contentType: b.contentType, coverUrl: b.coverUrl }}
                href={`/library/${b.seriesId}`}
              />
              {(() => {
                const vl = volumeLabel(b.contentType, b.volumeNumber, b.volumeTitle);
                return vl ? (
                  <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground truncate">{vl}</span>
                ) : null;
              })()}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── member strip ─────────────────────────────────────────────
export function MemberStrip({
  members,
  currentId,
}: {
  members: ProfileMember[];
  currentId: number;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Members
      </span>
      {members.map((m) => {
        const on = m.id === currentId;
        return (
          <Link
            key={m.id}
            href={`/profile/${m.id}`}
            className={`inline-flex items-center gap-2 rounded-full py-[5px] pl-[5px] pr-3 ${
              on ? 'border border-primary/40 bg-primary/10' : 'border border-border bg-card'
            }`}
          >
            <Avatar
              email={m.name}
              name={m.name}
              size={22}
              avatarUrl={m.avatarUrl}
              variant={colorFromSeed(m.name)}
            />
            <span className={`text-xs font-medium ${on ? 'text-primary' : 'text-foreground/80'}`}>
              {firstName(m.name)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ── shared in-card empty ─────────────────────────────────────
function InCardEmpty({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="grid min-h-[160px] place-items-center">
      <EmptyState staged={false} variant="muted" icon={icon} title={title} body={body} />
    </div>
  );
}
