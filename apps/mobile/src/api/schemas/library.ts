import { z } from 'zod';

// ── Content types ─────────────────────────────────────────────────────────────

export const ContentTypeEnum = z.enum(['manga', 'comic', 'light_novel', 'ebook', 'audiobook']);
export type ContentTypeEnum = z.infer<typeof ContentTypeEnum>;

// ── Storage settings ──────────────────────────────────────────────────────────

const ContentTypePathEntry = z.object({
  libraryRoot: z.string(),
  qbtCategory: z.string(),
});

export const TorrentCleanup = z.object({
  mode: z.enum(['never', 'after_import', 'after_ratio', 'after_seed_time']),
  ratio: z.number().positive().optional(),
  seedMinutes: z.number().int().positive().optional(),
  deleteFiles: z.boolean(),
});
export type TorrentCleanup = z.infer<typeof TorrentCleanup>;

export const ImageCache = z.object({
  enabled: z.boolean(),
  dir: z.string(),
});
export type ImageCache = z.infer<typeof ImageCache>;

export const StorageSettings = z.object({
  contentTypePaths: z.partialRecord(ContentTypeEnum, ContentTypePathEntry),
  torrentCleanup: TorrentCleanup,
  imageCache: ImageCache,
});
export type StorageSettings = z.infer<typeof StorageSettings>;

// ── Discover settings ─────────────────────────────────────────────────────────

export const DiscoverSettings = z.object({
  trendingSource: z.enum(['anilist', 'mal']),
});
export type DiscoverSettings = z.infer<typeof DiscoverSettings>;

// ── Scan ──────────────────────────────────────────────────────────────────────

export const ScanStartResponse = z.object({
  jobId: z.number(),
});
export type ScanStartResponse = z.infer<typeof ScanStartResponse>;

// ── Job status ────────────────────────────────────────────────────────────────

export const JobStatus = z.object({
  id: z.number(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'interrupted', 'cancelled']),
  error: z.string().nullable().optional(),
});
export type JobStatus = z.infer<typeof JobStatus>;
