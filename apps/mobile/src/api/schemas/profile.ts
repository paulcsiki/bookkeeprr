import { z } from 'zod';
import { ContentType } from './series';

// GET /api/profile/:userId — a household member's read-only profile dossier
// (lifetime reading stats, in-progress + finished titles, recent activity).
// Mirrors the web's /profile/[userId] page payload. `format.byType` keeps the
// server's content-type vocabulary (light_novel / audiobook) like the dashboard
// schema does; typed item fields map to the short forms via ContentType.

export const ProfileStats = z.object({
  minutes: z.number(),
  units: z.number(),
  booksFinished: z.number(),
  streakDays: z.number(),
});
export type ProfileStats = z.infer<typeof ProfileStats>;

export const ProfileContinueItem = z.object({
  readableKey: z.string(),
  title: z.string(),
  contentType: ContentType,
  coverUrl: z.string().nullable(),
  /** 0..100 reading progress. */
  pct: z.number(),
  seriesId: z.number(),
  volumeNumber: z.number().nullable(),
  volumeTitle: z.string().nullable(),
});
export type ProfileContinueItem = z.infer<typeof ProfileContinueItem>;

export const ProfileFinishedItem = z.object({
  readableKey: z.string(),
  title: z.string(),
  contentType: ContentType,
  coverUrl: z.string().nullable(),
  seriesId: z.number(),
  volumeNumber: z.number().nullable(),
  volumeTitle: z.string().nullable(),
});
export type ProfileFinishedItem = z.infer<typeof ProfileFinishedItem>;

export const ProfileActivityItem = z.object({
  id: z.number(),
  kind: z.string(),
  seriesId: z.number().nullable(),
  volumeId: z.number().nullable(),
  seriesTitle: z.string().nullable(),
  coverUrl: z.string().nullable(),
  contentType: ContentType.nullable(),
  volumeNumber: z.number().nullable(),
  volumeTitle: z.string().nullable(),
  /** ISO timestamp. */
  createdAt: z.string(),
});
export type ProfileActivityItem = z.infer<typeof ProfileActivityItem>;

export const ProfileMemberChip = z.object({
  id: z.number(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
export type ProfileMemberChip = z.infer<typeof ProfileMemberChip>;

export const UserProfileResponse = z.object({
  member: z.object({
    id: z.number(),
    name: z.string(),
    /** Display role label ("Owner" for admins, "Member" otherwise). */
    roleLabel: z.string(),
    isAdmin: z.boolean(),
    avatarUrl: z.string().nullable(),
    /** Seed for the Gravatar lookup + initials fallback. */
    avatarSeed: z.string(),
    /** Pre-formatted join date, e.g. "Jun 2026". */
    joinedLabel: z.string(),
    /** Dominant content type over all time (the "loves" line), or null. */
    favType: ContentType.nullable(),
  }),
  /** True when the viewed member is the current viewer. */
  isYou: z.boolean(),
  /** Lifetime totals. */
  stats: ProfileStats,
  /** 1-based all-time rank by reading time, and total member count. */
  serverRank: z.number(),
  memberCount: z.number(),
  longestStreak: z.number(),
  continueItems: z.array(ProfileContinueItem),
  activity: z.array(ProfileActivityItem),
  /** Per-type minutes in the server's vocabulary (manga / light_novel / …). */
  format: z.object({
    byType: z.record(z.string(), z.number()),
    totalMinutes: z.number(),
  }),
  /** Minutes per week, oldest → newest (12 weeks). */
  trend: z.array(z.number()),
  /** Distinct active days over the last year. */
  activeDays: z.number(),
  finished: z.array(ProfileFinishedItem),
  members: z.array(ProfileMemberChip),
});
export type UserProfileResponse = z.infer<typeof UserProfileResponse>;
