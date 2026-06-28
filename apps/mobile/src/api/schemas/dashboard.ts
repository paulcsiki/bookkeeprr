import { z } from 'zod';
import { ContentType } from './series';

const PeriodStats = z.object({
  minutes: z.number(),
  units: z.number(),
  booksFinished: z.number(),
  streakDays: z.number(),
});

const ContinueItem = z.object({
  readableKey: z.string(),
  title: z.string(),
  contentType: ContentType,
  coverUrl: z.string().nullable(),
  pct: z.number(),
  seriesId: z.number(),
  readerHref: z.string().nullable(),
});

const LeaderboardEntry = z.object({
  userId: z.number(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(['admin', 'user']),
  value: z.number(),
});

const ReleaseItem = z.object({
  seriesId: z.number(),
  volumeId: z.number(),
  title: z.string(),
  contentType: ContentType,
  coverUrl: z.string().nullable(),
  whenLabel: z.string(),
  detail: z.string(),
  soon: z.boolean(),
});

const RecentItem = z.object({
  seriesId: z.number(),
  title: z.string(),
  contentType: ContentType,
  coverUrl: z.string().nullable(),
  author: z.string().nullable(),
});

const FeedItem = z.object({
  id: z.number(),
  kind: z.string(),
  seriesId: z.number().nullable(),
  volumeId: z.number().nullable(),
  seriesTitle: z.string().nullable(),
  coverUrl: z.string().nullable(),
  contentType: ContentType.nullable(),
  createdAt: z.string(),
  actorName: z.string().nullable(),
  actorAvatarUrl: z.string().nullable(),
});

export const DashboardResponse = z.object({
  period: z.enum(['week', 'month', 'year', 'all']),
  greetingName: z.string(),
  memberCount: z.number(),
  continueItems: z.array(ContinueItem),
  personal: z.object({
    current: PeriodStats,
    previous: PeriodStats,
    distribution: z.array(z.number()),
    trend: z.array(z.number()),
    favType: ContentType.nullable(),
  }),
  goals: z.object({
    goals: z.object({
      yearlyBooks: z.number().nullable().optional(),
      weeklyMinutes: z.number().nullable().optional(),
      streakDays: z.number().nullable().optional(),
    }),
    yearBooksDone: z.number(),
    weekMinutesDone: z.number(),
    streakDays: z.number(),
  }),
  leaderboard: z.object({
    time: z.array(LeaderboardEntry),
    books: z.array(LeaderboardEntry),
    streak: z.array(LeaderboardEntry),
  }),
  format: z.object({
    byType: z.record(z.string(), z.number()),
    totalMinutes: z.number(),
  }),
  releases: z.array(ReleaseItem),
  server: z.object({
    minutes: z.number(),
    booksFinished: z.number(),
    units: z.number(),
    activeReaders: z.number(),
    totalMembers: z.number(),
  }),
  recent: z.array(RecentItem),
  feed: z.array(FeedItem),
});
export type DashboardResponse = z.infer<typeof DashboardResponse>;
