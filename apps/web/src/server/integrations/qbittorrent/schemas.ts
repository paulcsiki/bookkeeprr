import { z } from 'zod';

export const QbtTorrentSchema = z.object({
  hash: z.string(),
  name: z.string(),
  state: z.string(),
  progress: z.number(),
  category: z.string(),
  tags: z.string(),
  save_path: z.string(),
  size: z.number(),
  completed: z.number(),
  // Live transfer fields (present on torrents/info; optional so fixtures and
  // older responses that omit them still parse).
  dlspeed: z.number().optional(),
  eta: z.number().optional(),
  num_seeds: z.number().optional(),
  num_leechs: z.number().optional(),
  // Cleanup-policy fields (present on torrents/info; tolerant of older qBit /
  // partial responses so missing values default to 0 instead of failing parse).
  ratio: z.number().catch(0),
  seeding_time: z.number().catch(0),
  // Unix seconds the torrent was added. Used to pick the newly-added torrent when
  // the grabber can't precompute an info-hash. Optional for fixtures/older qBit.
  added_on: z.number().optional(),
});

export const QbtTorrentsListSchema = z.array(QbtTorrentSchema);

export const QbtFileSchema = z.object({
  name: z.string(),
  size: z.number(),
  progress: z.number(),
});

export const QbtFilesListSchema = z.array(QbtFileSchema);

export type QbtTorrent = z.infer<typeof QbtTorrentSchema>;
export type QbtFile = z.infer<typeof QbtFileSchema>;
