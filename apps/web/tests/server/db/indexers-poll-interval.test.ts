import { describe, expect, it } from 'vitest';
import { parseIndexerConfig } from '@/server/db/indexers';

describe('parseIndexerConfig pollIntervalSeconds', () => {
  it('defaults to 900 when absent (nyaa)', () => {
    const cfg = parseIndexerConfig(
      JSON.stringify({ queryTemplate: '{title}', contentTypes: ['manga'] }),
      'nyaa',
    );
    expect(cfg.pollIntervalSeconds).toBe(900);
  });

  it('defaults to 900 when absent (filelist)', () => {
    const cfg = parseIndexerConfig(
      JSON.stringify({ queryTemplate: '{title}', contentTypes: ['light_novel'] }),
      'filelist',
    );
    expect(cfg.pollIntervalSeconds).toBe(900);
  });

  it('round-trips explicit value (nyaa)', () => {
    const cfg = parseIndexerConfig(JSON.stringify({ pollIntervalSeconds: 1800 }), 'nyaa');
    expect(cfg.pollIntervalSeconds).toBe(1800);
  });

  it('round-trips explicit value (filelist)', () => {
    const cfg = parseIndexerConfig(JSON.stringify({ pollIntervalSeconds: 3600 }), 'filelist');
    expect(cfg.pollIntervalSeconds).toBe(3600);
  });

  it('falls back to 900 when value is non-numeric (string)', () => {
    const cfg = parseIndexerConfig(JSON.stringify({ pollIntervalSeconds: 'foo' }), 'nyaa');
    expect(cfg.pollIntervalSeconds).toBe(900);
  });

  it('falls back to 900 when value is null', () => {
    const cfg = parseIndexerConfig(JSON.stringify({ pollIntervalSeconds: null }), 'filelist');
    expect(cfg.pollIntervalSeconds).toBe(900);
  });

  it('falls back to 900 when value is out of range (too low)', () => {
    const cfg = parseIndexerConfig(JSON.stringify({ pollIntervalSeconds: 30 }), 'nyaa');
    expect(cfg.pollIntervalSeconds).toBe(900);
  });

  it('falls back to 900 when value is out of range (too high)', () => {
    const cfg = parseIndexerConfig(JSON.stringify({ pollIntervalSeconds: 86401 }), 'filelist');
    expect(cfg.pollIntervalSeconds).toBe(900);
  });
});
