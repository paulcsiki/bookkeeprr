import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  calibreSetting,
  isCalibreConfigured,
  type CalibreConfig,
} from '@/server/db/settings/calibre';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('calibreSetting', () => {
  it('returns defaults when unset', async () => {
    const cfg = await calibreSetting.get();
    expect(cfg.baseUrl).toBeNull();
    expect(cfg.username).toBeNull();
    expect(cfg.password).toBeNull();
    expect(cfg.libraryId).toBe('0');
    expect(cfg.contentTypes).toEqual(['ebook']);
    expect(cfg.enabled).toBe(false);
  });

  it('round-trips a full save', async () => {
    await calibreSetting.set({
      baseUrl: 'http://calibre.local:8080',
      username: 'admin',
      password: 'hunter2',
      libraryId: 'main',
      contentTypes: ['ebook', 'light_novel'],
      enabled: true,
    });
    const cfg = await calibreSetting.get();
    expect(cfg.baseUrl).toBe('http://calibre.local:8080');
    expect(cfg.username).toBe('admin');
    expect(cfg.password).toBe('hunter2');
    expect(cfg.libraryId).toBe('main');
  });
});

describe('isCalibreConfigured', () => {
  it('requires only enabled + baseUrl (auth is optional)', () => {
    const cfg: CalibreConfig = {
      baseUrl: 'http://x',
      username: null,
      password: null,
      libraryId: '0',
      contentTypes: ['ebook'],
      enabled: true,
    };
    expect(isCalibreConfigured(cfg)).toBe(true);

    expect(isCalibreConfigured({ ...cfg, enabled: false })).toBe(false);
    expect(isCalibreConfigured({ ...cfg, baseUrl: null })).toBe(false);
    expect(isCalibreConfigured({ ...cfg, baseUrl: '' })).toBe(false);
  });
});
