import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST as TEST } from '@/app/api/indexers/prowlarr/test/route';
import { POST as SYNC } from '@/app/api/indexers/prowlarr/sync/route';
import * as prowlarr from '@/server/integrations/prowlarr';
import { prowlarrConnectionSetting } from '@/server/db/settings/prowlarr';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { expectShape } from '../../helpers/assert-spec';
import {
  MessageResponse,
  OkResponse,
  ProwlarrSyncResponse,
} from '@/server/openapi/schemas/indexers';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb(); });
afterEach(() => { h.cleanup(); vi.restoreAllMocks(); });

async function cookie(): Promise<string> {
  const a = await insertUser({ username: 'admin', passwordHash: await hashPassword('hunter22'), role: 'admin', mustChangePassword: false });
  const s = await createSession({ userId: a.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}
function req(body: unknown, c: string): Request {
  return new Request('http://t', { method: 'POST', headers: { cookie: c, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('prowlarr routes', () => {
  it('test: 401 for non-admin', async () => {
    const res = await TEST(new Request('http://t', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/indexers/prowlarr/test');
  });

  it('test: ok when client resolves', async () => {
    vi.spyOn(prowlarr, 'testProwlarr').mockResolvedValue();
    const res = await TEST(req({ url: 'http://p', apiKey: 'K' }, await cookie()));
    expect(res.status).toBe(200);
    await expectShape(OkResponse, res, 'POST /api/indexers/prowlarr/test');
  });

  it('sync: persists connection + returns summary', async () => {
    vi.spyOn(prowlarr, 'listProwlarrIndexers').mockResolvedValue([{ id: 1, name: 'B', enable: true, categories: [7020] }]);
    const res = await SYNC(req({ url: 'http://prowlarr:9696', apiKey: 'KEY' }, await cookie()));
    expect(res.status).toBe(200);
    await expectShape(ProwlarrSyncResponse, res, 'POST /api/indexers/prowlarr/sync');
    const body = await res.json();
    expect(body).toEqual({ added: 1, updated: 0, disabled: 0 });
    expect((await prowlarrConnectionSetting.get()).apiKey).toBe('KEY');
  });
});
