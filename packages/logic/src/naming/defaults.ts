// Media content-type union. Kept inline (rather than importing
// `@bookkeeprr/types`) so this RN-safe package has no extra workspace
// dependency. Mirrors `CONTENT_TYPES` in `@bookkeeprr/types/pure` exactly.
export type ContentType = 'manga' | 'comic' | 'light_novel' | 'ebook' | 'audiobook';

export type NamingKey = 'series_folder' | 'volume' | 'chapter' | 'batch' | 'volume_subfolder';

const MANGA_KEYS: readonly NamingKey[] = [
  'series_folder',
  'volume',
  'chapter',
  'batch',
  'volume_subfolder',
];

// In M9 every content type uses the same 5 keys. Per-type milestones may diverge later.
export const NAMING_KEYS_BY_TYPE: Record<ContentType, readonly NamingKey[]> = {
  manga: MANGA_KEYS,
  comic: MANGA_KEYS,
  light_novel: MANGA_KEYS,
  ebook: MANGA_KEYS,
  audiobook: MANGA_KEYS,
};

const MANGA_DEFAULTS: Record<NamingKey, string> = {
  series_folder: '{group_path}/{series_title}',
  volume: '{series_title} - v{volume:00} [{group}].{ext}',
  chapter: '{series_title} - c{chapter:000} [{group}].{ext}',
  batch: '{series_title} - c{chapter_range} [{group}].{ext}',
  volume_subfolder: '',
};

const COMIC_DEFAULTS: Record<NamingKey, string> = {
  series_folder: '{group_path}/{publisher}/{series_title} ({series_year})',
  volume: '{series_title} v{volume:00} [{group}].{ext}',
  chapter: '{series_title} #{chapter:000} [{group}].{ext}',
  batch: '{series_title} #{chapter_range} [{group}].{ext}',
  volume_subfolder: '',
};

const LIGHT_NOVEL_DEFAULTS: Record<NamingKey, string> = {
  series_folder: '{group_path}/{author}/{series_title} Light Novel',
  volume: '{series_title} - v{volume:00} [{group}].{ext}',
  chapter: '{series_title} - c{chapter:000} [{group}].{ext}',
  batch: '{series_title} - c{chapter_range} [{group}].{ext}',
  volume_subfolder: '',
};

const EBOOK_DEFAULTS: Record<NamingKey, string> = {
  series_folder: '{group_path}/{author}/{series_title}',
  volume: '{series_title} - v{volume:00} [{group}].{ext}',
  chapter: '{series_title} - c{chapter:000} [{group}].{ext}',
  batch: '{series_title} - c{chapter_range} [{group}].{ext}',
  volume_subfolder: '',
};

const AUDIOBOOK_DEFAULTS: Record<NamingKey, string> = {
  series_folder: '{group_path}/{author}/{series_title}',
  volume: '{series_title}.{ext}',
  chapter: '{series_title} - chapter {chapter}.{ext}',
  batch: '{series_title} - chapters {chapter_range}.{ext}',
  volume_subfolder: '',
};

export const NAMING_DEFAULTS_BY_TYPE: Record<ContentType, Record<NamingKey, string>> = {
  manga: MANGA_DEFAULTS,
  comic: COMIC_DEFAULTS,
  light_novel: LIGHT_NOVEL_DEFAULTS,
  ebook: EBOOK_DEFAULTS,
  audiobook: AUDIOBOOK_DEFAULTS,
};

// Back-compat — pre-M9 imports continue to work
export const NAMING_KEYS = MANGA_KEYS;
export const NAMING_DEFAULTS = MANGA_DEFAULTS;
