import { describe, expect, it } from 'vitest';
import { parseIndexerConfig, seedDefaultIndexers, listIndexers } from '@/server/db/indexers';
import { seedDb } from '../../integration/helpers/seed';

describe('parseIndexerConfig — nyaa', () => {
  it('parses new discriminated shape', () => {
    const raw = JSON.stringify({
      kind: 'nyaa',
      queryTemplate: '{title} v{volume}',
      contentTypes: ['manga'],
      categoryByContentType: { manga: '3_1' },
    });
    const cfg = parseIndexerConfig(raw, 'nyaa');
    expect(cfg.kind).toBe('nyaa');
    if (cfg.kind === 'nyaa') {
      expect(cfg.queryTemplate).toBe('{title} v{volume}');
      expect(cfg.contentTypes).toEqual(['manga']);
      expect(cfg.categoryByContentType.manga).toBe('3_1');
    }
  });

  it('migrates legacy { queryTemplate, defaultCategory } shape', () => {
    const raw = JSON.stringify({ queryTemplate: '{title} {extra}', defaultCategory: '3_3' });
    const cfg = parseIndexerConfig(raw, 'nyaa');
    expect(cfg.kind).toBe('nyaa');
    if (cfg.kind === 'nyaa') {
      expect(cfg.contentTypes).toEqual(['manga', 'comic']);
      expect(cfg.categoryByContentType).toEqual({ manga: '3_3', comic: '3_3' });
    }
  });

  it('returns safe nyaa defaults on malformed JSON', () => {
    const cfg = parseIndexerConfig('not json', 'nyaa');
    expect(cfg.kind).toBe('nyaa');
    if (cfg.kind === 'nyaa') {
      expect(cfg.queryTemplate).toBe('{title} {extra}');
      expect(cfg.contentTypes).toEqual(['manga', 'comic']);
      expect(cfg.categoryByContentType).toEqual({ manga: '3_1', comic: '3_1' });
    }
  });
});

describe('parseIndexerConfig — filelist', () => {
  it('parses full filelist shape', () => {
    const raw = JSON.stringify({
      kind: 'filelist',
      queryTemplate: '{title}',
      contentTypes: ['light_novel'],
      categoryByContentType: { light_novel: 24 },
      username: 'paul',
      passkey: 'secret123',
    });
    const cfg = parseIndexerConfig(raw, 'filelist');
    expect(cfg.kind).toBe('filelist');
    if (cfg.kind === 'filelist') {
      expect(cfg.username).toBe('paul');
      expect(cfg.passkey).toBe('secret123');
      expect(cfg.contentTypes).toEqual(['light_novel']);
      expect(cfg.categoryByContentType.light_novel).toBe(24);
    }
  });

  it('returns blank filelist defaults on empty config', () => {
    const cfg = parseIndexerConfig('{}', 'filelist');
    expect(cfg.kind).toBe('filelist');
    if (cfg.kind === 'filelist') {
      expect(cfg.username).toBe('');
      expect(cfg.passkey).toBe('');
      expect(cfg.contentTypes).toEqual([]);
      expect(cfg.categoryByContentType).toEqual({});
      expect(cfg.queryTemplate).toBe('{title} {extra}');
    }
  });

  it('returns safe filelist defaults on malformed JSON', () => {
    const cfg = parseIndexerConfig('not json', 'filelist');
    expect(cfg.kind).toBe('filelist');
    if (cfg.kind === 'filelist') {
      expect(cfg.username).toBe('');
      expect(cfg.passkey).toBe('');
    }
  });
});

describe('parseIndexerConfig — mam', () => {
  it('parses full mam shape', () => {
    const raw = JSON.stringify({
      kind: 'mam',
      queryTemplate: '{title}',
      contentTypes: ['ebook', 'audiobook'],
      categoryByContentType: { ebook: 14, audiobook: 13 },
      mamId: 'sess123',
      proxyUrl: 'http://gluetun.media.svc.cluster.local:8888',
      searchIn: ['title', 'author'],
    });
    const cfg = parseIndexerConfig(raw, 'mam');
    expect(cfg.kind).toBe('mam');
    if (cfg.kind === 'mam') {
      expect(cfg.mamId).toBe('sess123');
      expect(cfg.proxyUrl).toBe('http://gluetun.media.svc.cluster.local:8888');
      expect(cfg.categoryByContentType.ebook).toBe(14);
      expect(cfg.categoryByContentType.audiobook).toBe(13);
      expect(cfg.searchIn).toEqual(['title', 'author']);
    }
  });

  it('defaults searchIn to ["title"] and secrets to "" on empty config', () => {
    const cfg = parseIndexerConfig('{}', 'mam');
    expect(cfg.kind).toBe('mam');
    if (cfg.kind === 'mam') {
      expect(cfg.mamId).toBe('');
      expect(cfg.proxyUrl).toBe('');
      expect(cfg.searchIn).toEqual(['title']);
      expect(cfg.categoryByContentType).toEqual({});
    }
  });
});

describe('seedDefaultIndexers', () => {
  it('creates nyaa + filelist rows idempotently', async () => {
    const h = await seedDb();
    try {
      await seedDefaultIndexers();
      const after1 = await listIndexers();
      const kinds1 = after1.map((r) => r.kind).sort();
      expect(kinds1).toEqual(['filelist', 'nyaa']);

      // Re-run; should still be exactly two rows.
      await seedDefaultIndexers();
      const after2 = await listIndexers();
      expect(after2).toHaveLength(2);

      const filelist = after2.find((r) => r.kind === 'filelist')!;
      expect(filelist.enabled).toBe(false);
      const cfg = JSON.parse(filelist.configJson) as Record<string, unknown>;
      expect(cfg.username).toBe('');
      expect(cfg.passkey).toBe('');

      const nyaa = after2.find((r) => r.kind === 'nyaa')!;
      expect(nyaa.enabled).toBe(true);
    } finally {
      h.cleanup();
    }
  });
});
