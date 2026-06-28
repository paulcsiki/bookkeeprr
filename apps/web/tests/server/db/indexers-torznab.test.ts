import { describe, expect, it } from 'vitest';
import { parseIndexerConfig } from '@/server/db/indexers';

describe('parseIndexerConfig(torznab)', () => {
  it('parses a full torznab config', () => {
    const cfg = parseIndexerConfig(
      JSON.stringify({
        kind: 'torznab',
        queryTemplate: '{title} {extra}',
        contentTypes: ['ebook', 'audiobook'],
        categoryByContentType: { ebook: '7020', audiobook: '3030' },
        apiKey: 'KEY',
        pollIntervalSeconds: 1800,
      }),
      'torznab',
    );
    expect(cfg.kind).toBe('torznab');
    if (cfg.kind === 'torznab') {
      expect(cfg.apiKey).toBe('KEY');
      expect(cfg.categoryByContentType).toEqual({ ebook: '7020', audiobook: '3030' });
      expect(cfg.contentTypes).toEqual(['ebook', 'audiobook']);
      expect(cfg.pollIntervalSeconds).toBe(1800);
    }
  });

  it('applies defaults for missing fields', () => {
    const cfg = parseIndexerConfig(JSON.stringify({ kind: 'torznab' }), 'torznab');
    if (cfg.kind === 'torznab') {
      expect(cfg.apiKey).toBe('');
      expect(cfg.contentTypes).toEqual([]);
      expect(cfg.categoryByContentType).toEqual({});
      expect(typeof cfg.pollIntervalSeconds).toBe('number');
      expect(cfg.queryTemplate.length).toBeGreaterThan(0);
    }
  });

  it('carries prowlarrIndexerId through parse', () => {
    const cfg = parseIndexerConfig(
      JSON.stringify({ kind: 'torznab', apiKey: 'K', prowlarrIndexerId: 7 }),
      'torznab',
    );
    if (cfg.kind === 'torznab') expect(cfg.prowlarrIndexerId).toBe(7);
  });
  it('omits prowlarrIndexerId when absent', () => {
    const cfg = parseIndexerConfig(JSON.stringify({ kind: 'torznab', apiKey: 'K' }), 'torznab');
    if (cfg.kind === 'torznab') expect(cfg.prowlarrIndexerId).toBeUndefined();
  });
});
