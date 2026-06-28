import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/server/config/env.js';

describe('config/env', () => {
  it('applies defaults when nothing is set', () => {
    const env = parseEnv({});
    expect(env.BOOKKEEPRR_CONFIG_DIR).toBe('/config');
    expect(env.BOOKKEEPRR_MEDIA_ROOT).toBe('/media');
    expect(env.BOOKKEEPRR_PORT).toBe(3000);
    expect(env.BOOKKEEPRR_LOG_LEVEL).toBe('info');
  });

  it('respects overrides', () => {
    const env = parseEnv({
      BOOKKEEPRR_CONFIG_DIR: '/srv/bk/config',
      BOOKKEEPRR_PORT: '8080',
      BOOKKEEPRR_LOG_LEVEL: 'debug',
    });
    expect(env.BOOKKEEPRR_CONFIG_DIR).toBe('/srv/bk/config');
    expect(env.BOOKKEEPRR_PORT).toBe(8080);
    expect(env.BOOKKEEPRR_LOG_LEVEL).toBe('debug');
  });

  it('rejects invalid log level', () => {
    expect(() => parseEnv({ BOOKKEEPRR_LOG_LEVEL: 'verbose' })).toThrow();
  });

  it('rejects non-numeric port', () => {
    expect(() => parseEnv({ BOOKKEEPRR_PORT: 'abc' })).toThrow();
  });
});
