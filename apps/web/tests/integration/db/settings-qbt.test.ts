import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { qbtConnectionSetting, type QbtConnection } from '@/server/db/settings/qbt';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('qbtConnectionSetting', () => {
  it('returns the default empty connection when not set', async () => {
    const v = await qbtConnectionSetting.get();
    expect(v).toEqual({
      host: '',
      port: 8080,
      username: '',
      password: '',
      useHttps: false,
    });
  });

  it('roundtrips a complete config', async () => {
    const cfg: QbtConnection = {
      host: 'qbt.local',
      port: 9090,
      username: 'paul',
      password: 'secret',
      useHttps: true,
    };
    await qbtConnectionSetting.set(cfg);
    expect(await qbtConnectionSetting.get()).toEqual(cfg);
  });

  it('rejects bad shape on set', async () => {
    // @ts-expect-error — intentionally bad shape
    await expect(qbtConnectionSetting.set({ host: 42 })).rejects.toBeTruthy();
  });
});
