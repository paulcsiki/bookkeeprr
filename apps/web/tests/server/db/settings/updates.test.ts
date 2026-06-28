import { describe, expect, it } from 'vitest';
import { UpdatesConfigSchema, DEFAULT_UPDATES_CONFIG } from '@/server/db/settings/updates';

describe('UpdatesConfigSchema legacy migration', () => {
  it('maps { enabled: true } to frequency=daily', () => {
    const result = UpdatesConfigSchema.parse({
      enabled: true,
      notifyOnIntegrations: false,
      showChangelogOnFirstLaunch: true,
    });
    expect(result.frequency).toBe('daily');
    expect(result.behavior).toBe('notify');
    expect('enabled' in result).toBe(false);
  });

  it('maps { enabled: false } to frequency=off', () => {
    const result = UpdatesConfigSchema.parse({
      enabled: false,
      notifyOnIntegrations: false,
      showChangelogOnFirstLaunch: false,
    });
    expect(result.frequency).toBe('off');
  });

  it('passes through new-shape values without mutation', () => {
    const result = UpdatesConfigSchema.parse({
      frequency: 'weekly',
      behavior: 'auto-download',
      notifyOnIntegrations: true,
      showChangelogOnFirstLaunch: false,
    });
    expect(result.frequency).toBe('weekly');
    expect(result.behavior).toBe('auto-download');
  });

  it('defaults frequency to daily and behavior to notify when absent', () => {
    const result = UpdatesConfigSchema.parse({
      notifyOnIntegrations: false,
      showChangelogOnFirstLaunch: true,
    });
    expect(result.frequency).toBe('daily');
    expect(result.behavior).toBe('notify');
  });

  it('DEFAULT_UPDATES_CONFIG is valid', () => {
    expect(() => UpdatesConfigSchema.parse(DEFAULT_UPDATES_CONFIG)).not.toThrow();
  });
});
