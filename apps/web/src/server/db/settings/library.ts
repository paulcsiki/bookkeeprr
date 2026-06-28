import { join } from 'node:path';
import { z } from 'zod';
import { CONTENT_TYPES } from '@/server/content-type';
import {
  ContentTypePathsSchema,
  ImageCacheSchema,
  TorrentCleanupSchema,
} from '@/server/openapi/schemas/settings';
import { defineSetting } from '../settings';

/** Runtime override for the media/library root, used only when BOOKKEEPRR_MEDIA_ROOT is unset. */
export const mediaRootSetting = defineSetting('library.mediaRoot', z.string(), '');

// Single-sourced in the OpenAPI schema module (also the PUT /api/settings/storage
// body), where the shape is built from ContentTypeEnum so a new content type
// can never drift out of sync with the settings model.
export const contentTypePathsSchema = ContentTypePathsSchema;

export type ContentTypePaths = z.infer<typeof contentTypePathsSchema>;

const contentTypePathsDefault = Object.fromEntries(
  CONTENT_TYPES.map((t) => [t, { libraryRoot: '', qbtCategory: '' }]),
) as ContentTypePaths;

/** Per-content-type library root + qBittorrent category overrides. Blank → fallback. */
export const contentTypePathsSetting = defineSetting(
  'library.contentTypePaths',
  contentTypePathsSchema,
  contentTypePathsDefault,
);

export const torrentCleanupSchema = TorrentCleanupSchema;

export type TorrentCleanup = z.infer<typeof torrentCleanupSchema>;

const torrentCleanupDefault: TorrentCleanup = { mode: 'never', deleteFiles: false };

/** Opt-in torrent removal policy. Default `never` (no removal). */
export const torrentCleanupSetting = defineSetting(
  'library.torrentCleanup',
  torrentCleanupSchema,
  torrentCleanupDefault,
);

export const imageCacheSchema = ImageCacheSchema;

export type ImageCache = z.infer<typeof imageCacheSchema>;

const imageCacheDefault: ImageCache = { enabled: false, dir: '' };

/** Opt-in server-side cache for library cover art. Default off, default dir. */
export const imageCacheSetting = defineSetting(
  'library.imageCache',
  imageCacheSchema,
  imageCacheDefault,
);

/**
 * The effective on-disk directory for cached library covers: the configured
 * `dir` when non-empty, else `<BOOKKEEPRR_CONFIG_DIR or /config>/cache/images`.
 */
export async function getImageCacheDir(): Promise<string> {
  const { dir } = await imageCacheSetting.get();
  if (dir) return dir;
  return join(process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config', 'cache', 'images');
}
