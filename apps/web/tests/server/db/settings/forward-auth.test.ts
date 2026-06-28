import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  forwardAuthConfigSetting,
  isForwardAuthConfigured,
} from '@/server/db/settings/forward-auth';

describe('forwardAuthConfigSetting', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('returns defaults when no row stored', async () => {
    const cfg = await forwardAuthConfigSetting.get();
    expect(cfg.enabled).toBe(false);
    expect(cfg.trustedProxies).toEqual([]);
    expect(cfg.userHeader).toBe('Remote-User');
    expect(cfg.emailHeader).toBe('Remote-Email');
    expect(cfg.groupsHeader).toBe('Remote-Groups');
    expect(cfg.autoCreateUsers).toBe(true);
    expect(cfg.allowedGroups).toEqual([]);
    expect(cfg.adminGroups).toEqual([]);
  });

  it('round-trips a fully-populated config', async () => {
    await forwardAuthConfigSetting.set({
      enabled: true,
      trustedProxies: ['192.168.1.0/24', 'fd00::/8'],
      userHeader: 'X-Forwarded-User',
      emailHeader: 'X-Forwarded-Email',
      groupsHeader: 'X-Forwarded-Groups',
      autoCreateUsers: false,
      allowedGroups: ['bookkeeprr-users'],
      adminGroups: ['bookkeeprr-admins'],
    });
    const cfg = await forwardAuthConfigSetting.get();
    expect(cfg.enabled).toBe(true);
    expect(cfg.trustedProxies).toEqual(['192.168.1.0/24', 'fd00::/8']);
    expect(cfg.userHeader).toBe('X-Forwarded-User');
    expect(cfg.allowedGroups).toEqual(['bookkeeprr-users']);
    expect(cfg.adminGroups).toEqual(['bookkeeprr-admins']);
  });

  it('isForwardAuthConfigured requires enabled + non-empty trustedProxies + non-empty userHeader', async () => {
    const base = {
      enabled: true,
      trustedProxies: ['10.0.0.0/8'],
      userHeader: 'Remote-User',
      emailHeader: 'Remote-Email',
      groupsHeader: 'Remote-Groups',
      autoCreateUsers: true,
      allowedGroups: [],
      adminGroups: [],
    };
    expect(isForwardAuthConfigured(base)).toBe(true);
    expect(isForwardAuthConfigured({ ...base, enabled: false })).toBe(false);
    expect(isForwardAuthConfigured({ ...base, trustedProxies: [] })).toBe(false);
    expect(isForwardAuthConfigured({ ...base, userHeader: '' })).toBe(false);
  });
});
