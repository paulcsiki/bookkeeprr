import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST } from '@/app/api/indexers/torznab/caps/route';
import { __setTorznabFetcherForTests, __resetTorznabForTests } from '@/server/integrations/torznab';
import { insertIndexer } from '@/server/db/indexers';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { MessageResponse, TorznabCapsResponse } from '@/server/openapi/schemas/indexers';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb(); });
afterEach(() => { h.cleanup(); __resetTorznabForTests(); });

async function adminCookie(): Promise<string> {
  const a = await insertUser({ username: 'admin', passwordHash: await hashPassword('hunter22'), role: 'admin', mustChangePassword: false });
  const s = await createSession({ userId: a.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

describe('POST /api/indexers/torznab/caps', () => {
  it('returns the discovered categories', async () => {
    __setTorznabFetcherForTests(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(
      `<caps><categories><category id="7000" name="Books"><subcat id="7020" name="EBook"/></category></categories></caps>`) }));
    const cookie = await adminCookie();
    const res = await POST(new Request('http://t', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://prowlarr/1/api', apiKey: 'K' }),
    }));
    expect(res.status).toBe(200);
    await expectShape(TorznabCapsResponse, res, 'POST /api/indexers/torznab/caps');
    const body = await res.json();
    expect(body.categories[0].id).toBe('7000');
  });

  it('falls back to the stored apiKey when blank + indexerId given', async () => {
    let sentUrl = '';
    __setTorznabFetcherForTests((u) => { sentUrl = u; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(
      `<caps><categories><category id="7000" name="Books"/></categories></caps>`) }); });
    const id = await insertIndexer({
      kind: 'torznab', name: 'P', baseUrl: 'http://prowlarr/1/api', enabled: true,
      configJson: { kind: 'torznab', queryTemplate: '{title}', contentTypes: ['ebook'], categoryByContentType: { ebook: '7020' }, apiKey: 'STORED-KEY', pollIntervalSeconds: 900 },
    });
    const cookie = await adminCookie();
    const res = await POST(new Request('http://t', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://prowlarr/1/api', apiKey: '', indexerId: id }),
    }));
    expect(res.status).toBe(200);
    expect(sentUrl).toContain('apikey=STORED-KEY');
  });

  it('400s when no key entered and no stored key', async () => {
    const cookie = await adminCookie();
    const res = await POST(new Request('http://t', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://x/api', apiKey: '' }),
    }));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/indexers/torznab/caps');
  });

  it('401s for non-admins', async () => {
    const res = await POST(new Request('http://t', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/indexers/torznab/caps');
  });
});
