import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST, GET } from '@/app/api/indexers/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb(); });
afterEach(() => h.cleanup());

async function adminCookie(): Promise<string> {
  const a = await insertUser({ username: 'admin', passwordHash: await hashPassword('hunter22'), role: 'admin', mustChangePassword: false });
  const s = await createSession({ userId: a.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

describe('POST /api/indexers (torznab)', () => {
  it('creates a torznab indexer and masks apiKey on GET', async () => {
    const cookie = await adminCookie();
    const res = await POST(new Request('http://t', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'torznab',
        name: 'Prowlarr',
        baseUrl: 'http://prowlarr:9696/1/api',
        enabled: true,
        configJson: {
          kind: 'torznab',
          queryTemplate: '{title} {extra}',
          contentTypes: ['ebook'],
          categoryByContentType: { ebook: '7020' },
          apiKey: 'SECRET',
          pollIntervalSeconds: 900,
        },
      }),
    }));
    expect(res.status).toBe(201);

    const list = await GET(new Request('http://t', { headers: { cookie } }));
    const body = await list.json();
    const tz = body.indexers.find((i: { kind: string }) => i.kind === 'torznab');
    expect(tz).toBeTruthy();
    expect(JSON.parse(tz.configJson).apiKey).toBe(''); // masked
  });
});
