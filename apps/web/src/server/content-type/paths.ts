import { join } from 'node:path';
import { CONTENT_TYPES, type ContentType } from './index';
import { contentTypePathsSetting, mediaRootSetting } from '@/server/db/settings/library';

const SUBDIR: Record<ContentType, string> = {
  manga: 'comics',
  comic: 'comics',
  light_novel: 'books',
  ebook: 'books',
  audiobook: 'audiobooks',
};

export function contentTypeSubdir(contentType: ContentType): string {
  const sub = SUBDIR[contentType];
  if (sub === undefined) {
    throw new Error(`unmapped content type: ${contentType}`);
  }
  return sub;
}

export async function getMediaRoot(): Promise<string> {
  const env = process.env.BOOKKEEPRR_MEDIA_ROOT;
  if (env !== undefined && env.length > 0) return env;
  const setting = await mediaRootSetting.get();
  return setting.length > 0 ? setting : '/media';
}

/**
 * Effective library directory for a content type: the per-type `libraryRoot`
 * override if set (an absolute path), otherwise `mediaRoot/<subdir>`.
 */
export async function getLibraryDir(contentType: ContentType): Promise<string> {
  const paths = await contentTypePathsSetting.get();
  const root = paths[contentType]?.libraryRoot ?? '';
  if (root.length > 0) return root;
  return join(await getMediaRoot(), contentTypeSubdir(contentType));
}

/**
 * Effective qBittorrent category for a content type: the per-type `qbtCategory`
 * override if set, otherwise `bookkeeprr-<type>`.
 */
export async function getQbtCategory(contentType: ContentType): Promise<string> {
  const paths = await contentTypePathsSetting.get();
  const category = paths[contentType]?.qbtCategory ?? '';
  if (category.length > 0) return category;
  return `bookkeeprr-${contentType}`;
}

/** Deduped set of effective library dirs across every content type. */
export async function getAllLibraryRoots(): Promise<string[]> {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const t of CONTENT_TYPES) {
    const dir = await getLibraryDir(t);
    if (!seen.has(dir)) {
      seen.add(dir);
      roots.push(dir);
    }
  }
  return roots;
}
