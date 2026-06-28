import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { POST } from '@/app/api/auth/login/route';

async function makeUser(username = 'alice', password = 'hunter22-correct'): Promise<void> {
  await insertUser({
    username,
    passwordHash: await hashPassword(password),
    role: 'admin',
    mustChangePassword: false,
  });
}

function loginReq(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login — username normalization', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('authenticates with the exact username', async () => {
    await makeUser('alice', 'hunter22-correct');
    const res = await POST(loginReq({ username: 'alice', password: 'hunter22-correct' }));
    expect(res.status).toBe(200);
  });

  // Mobile keyboards/autofill pad the username with whitespace; desktop does
  // not. The same credentials must work from both, so the route trims it.
  it('tolerates surrounding whitespace on the username', async () => {
    await makeUser('alice', 'hunter22-correct');
    const res = await POST(loginReq({ username: '  alice ', password: 'hunter22-correct' }));
    expect(res.status).toBe(200);
  });

  // Mobile keyboards auto-capitalize the first letter; the lookup is
  // case-insensitive, so this must still succeed.
  it('tolerates a case-variant username', async () => {
    await makeUser('alice', 'hunter22-correct');
    const res = await POST(loginReq({ username: 'Alice', password: 'hunter22-correct' }));
    expect(res.status).toBe(200);
  });

  // Passwords are NOT trimmed — trailing whitespace is significant.
  it('does not trim the password', async () => {
    await makeUser('alice', 'hunter22-correct');
    const ok = await POST(loginReq({ username: 'alice', password: 'hunter22-correct ' }));
    expect(ok.status).toBe(401);
  });

  it('still rejects a genuinely wrong password', async () => {
    await makeUser('alice', 'hunter22-correct');
    const res = await POST(loginReq({ username: 'alice', password: 'nope' }));
    expect(res.status).toBe(401);
  });
});
