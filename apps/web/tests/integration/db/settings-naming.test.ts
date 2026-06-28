import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import {
  NAMING_KEYS,
  NAMING_DEFAULTS,
  namingSetting,
  getAllNamingTemplates,
  setAllNamingTemplates,
  NAMING_DEFAULTS_BY_TYPE,
  NAMING_KEYS_BY_TYPE,
} from '@/server/db/settings/naming';
import { CONTENT_TYPES } from '@/server/content-type';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('naming settings', () => {
  it('exposes all 5 keys with defaults', () => {
    expect(NAMING_KEYS).toEqual([
      'series_folder',
      'volume',
      'chapter',
      'batch',
      'volume_subfolder',
    ]);
    expect(NAMING_DEFAULTS.series_folder).toBe('{group_path}/{series_title}');
    expect(NAMING_DEFAULTS.volume).toBe('{series_title} - v{volume:00} [{group}].{ext}');
    expect(NAMING_DEFAULTS.chapter).toBe('{series_title} - c{chapter:000} [{group}].{ext}');
    expect(NAMING_DEFAULTS.batch).toBe('{series_title} - c{chapter_range} [{group}].{ext}');
    expect(NAMING_DEFAULTS.volume_subfolder).toBe('');
  });

  it('roundtrips each key', async () => {
    for (const key of NAMING_KEYS) {
      const accessor = namingSetting('manga', key);
      expect(await accessor.get()).toBe(NAMING_DEFAULTS[key]);
      await accessor.set('CUSTOM');
      expect(await accessor.get()).toBe('CUSTOM');
    }
  });
});

describe('per-content-type naming settings', () => {
  it('exposes all 5 content types', () => {
    for (const t of CONTENT_TYPES) {
      expect(NAMING_KEYS_BY_TYPE[t]).toBeDefined();
      expect(NAMING_DEFAULTS_BY_TYPE[t]).toBeDefined();
    }
  });

  it('namingSetting reads the right key namespace', async () => {
    const mangaAcc = namingSetting('manga', 'volume');
    expect(mangaAcc.key).toBe('naming.manga.volume');
    const ebookAcc = namingSetting('ebook', 'volume');
    expect(ebookAcc.key).toBe('naming.ebook.volume');
  });

  it('ebook defaults fall back to manga in M9 (placeholder)', async () => {
    const v = await namingSetting('ebook', 'volume').get();
    expect(v).toBe('{series_title} - v{volume:00} [{group}].{ext}');
  });

  it('per-type writes do not cross-contaminate', async () => {
    await namingSetting('comic', 'volume').set('CUSTOM-comic');
    expect(await namingSetting('comic', 'volume').get()).toBe('CUSTOM-comic');
    expect(await namingSetting('manga', 'volume').get()).toBe(
      '{series_title} - v{volume:00} [{group}].{ext}',
    );
  });

  it('getAllNamingTemplates returns 5 keys for any type in M9', async () => {
    for (const t of CONTENT_TYPES) {
      const tpl = await getAllNamingTemplates(t);
      expect(Object.keys(tpl).sort()).toEqual(
        ['batch', 'chapter', 'series_folder', 'volume', 'volume_subfolder'].sort(),
      );
    }
  });

  it('setAllNamingTemplates writes per type only', async () => {
    await setAllNamingTemplates('audiobook', { series_folder: 'AB-{series_title}' });
    expect(await namingSetting('audiobook', 'series_folder').get()).toBe('AB-{series_title}');
    expect(await namingSetting('manga', 'series_folder').get()).toBe('{group_path}/{series_title}');
  });
});
