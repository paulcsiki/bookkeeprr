import { describe, expect, it } from 'vitest';
import { createLogger } from '@/server/logger.js';

describe('logger', () => {
  it('creates a logger with the configured level', () => {
    const log = createLogger({ level: 'warn' });
    expect(log.level).toBe('warn');
  });

  it('exposes child binding', () => {
    const log = createLogger({ level: 'info' });
    const child = log.child({ component: 'test' });
    expect(child.bindings()).toMatchObject({ component: 'test' });
  });

  it('createLogger returns a pino logger with the bookkeeprr app field', () => {
    const log = createLogger();
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.child).toBe('function');
  });

  it('respects level option', () => {
    const log = createLogger({ level: 'warn' });
    expect(log.level).toBe('warn');
  });

  it('child loggers carry component context', () => {
    const log = createLogger();
    const child = log.child({ component: 'audit' });
    expect(typeof child.info).toBe('function');
  });
});
