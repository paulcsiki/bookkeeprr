import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  audiobookshelfSetting,
  isAudiobookshelfConfigured,
  type AudiobookshelfConfig,
} from '@/server/db/settings/audiobookshelf';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('audiobookshelfSetting', () => {
  it('returns defaults when unset', async () => {
    const cfg = await audiobookshelfSetting.get();
    expect(cfg.baseUrl).toBeNull();
    expect(cfg.apiToken).toBeNull();
    expect(cfg.libraryId).toBeNull();
    expect(cfg.contentTypes).toEqual(['audiobook']);
    expect(cfg.enabled).toBe(false);
  });

  it('round-trips a full save', async () => {
    await audiobookshelfSetting.set({
      baseUrl: 'http://abs.local:13378',
      apiToken: 'token-123',
      libraryId: 'lib-a',
      contentTypes: ['audiobook', 'ebook'],
      enabled: true,
    });
    const cfg = await audiobookshelfSetting.get();
    expect(cfg.baseUrl).toBe('http://abs.local:13378');
    expect(cfg.apiToken).toBe('token-123');
    expect(cfg.libraryId).toBe('lib-a');
    expect(cfg.contentTypes).toEqual(['audiobook', 'ebook']);
    expect(cfg.enabled).toBe(true);
  });
});

describe('isAudiobookshelfConfigured', () => {
  it('requires enabled + baseUrl + apiToken + libraryId all set', () => {
    const cfg: AudiobookshelfConfig = {
      baseUrl: 'http://x',
      apiToken: 't',
      libraryId: 'l',
      contentTypes: ['audiobook'],
      enabled: true,
    };
    expect(isAudiobookshelfConfigured(cfg)).toBe(true);

    expect(isAudiobookshelfConfigured({ ...cfg, enabled: false })).toBe(false);
    expect(isAudiobookshelfConfigured({ ...cfg, baseUrl: null })).toBe(false);
    expect(isAudiobookshelfConfigured({ ...cfg, baseUrl: '' })).toBe(false);
    expect(isAudiobookshelfConfigured({ ...cfg, apiToken: null })).toBe(false);
    expect(isAudiobookshelfConfigured({ ...cfg, apiToken: '' })).toBe(false);
    expect(isAudiobookshelfConfigured({ ...cfg, libraryId: null })).toBe(false);
    expect(isAudiobookshelfConfigured({ ...cfg, libraryId: '' })).toBe(false);
  });
});
