import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser, updateUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { POST } from '@/app/api/mobile/exchange/route';
import { createExchangeCode, consumeExchangeCode } from '@/server/mobile/exchange-codes';
import { validateBearerToken } from '@/server/mobile/tokens';

async function makeUser(username = 'mobile-user'): Promise<number> {
  const u = await insertUser({
    username,
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  return u.id;
}

function mkReq(body: unknown): Request {
  return new Request('http://localhost/api/mobile/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/mobile/exchange', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('happy path: exchanges a valid code for a bearer + refresh token', async () => {
    const userId = await makeUser();
    const code = await createExchangeCode(userId);
    const res = await POST(mkReq({ exchange_code: code }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      refresh_token: string;
      expires_at: string;
    };
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.refresh_token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.token).not.toBe(body.refresh_token);
    // expires_at parses as an ISO-8601 timestamp in the future.
    const expMs = Date.parse(body.expires_at);
    expect(Number.isFinite(expMs)).toBe(true);
    expect(expMs).toBeGreaterThan(Date.now());
    // The issued token resolves back to the user.
    expect(await validateBearerToken(body.token)).toBe(userId);
  });

  it('rejects an unknown / invalid code with 401', async () => {
    await makeUser();
    const res = await POST(mkReq({ exchange_code: 'does-not-exist' }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_or_expired_code');
  });

  it('rejects a missing exchange_code with 400', async () => {
    const res = await POST(mkReq({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_body');
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await POST(mkReq('{ not json'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_json');
  });

  it('rejects an expired code with 401', async () => {
    const userId = await makeUser();
    const code = await createExchangeCode(userId, {
      expiresAtOverride: new Date(Date.now() - 1000),
    });
    const res = await POST(mkReq({ exchange_code: code }));
    expect(res.status).toBe(401);
  });

  it('codes are single-use: a second exchange attempt fails', async () => {
    const userId = await makeUser();
    const code = await createExchangeCode(userId);
    const first = await POST(mkReq({ exchange_code: code }));
    expect(first.status).toBe(200);
    const second = await POST(mkReq({ exchange_code: code }));
    expect(second.status).toBe(401);
  });

  it('refuses to issue a token for a disabled user', async () => {
    const userId = await makeUser();
    await updateUser(userId, { disabled: true });
    const code = await createExchangeCode(userId);
    const res = await POST(mkReq({ exchange_code: code }));
    expect(res.status).toBe(401);
  });

  describe('e2e login bypass (env-gated)', () => {
    const ENV_KEYS = [
      'BOOKKEEPRR_E2E_LOGIN_BYPASS',
      'BOOKKEEPRR_E2E_LOGIN_CODE',
      'BOOKKEEPRR_E2E_LOGIN_USERNAME',
    ] as const;
    const saved: Record<string, string | undefined> = {};
    beforeEach(() => {
      for (const k of ENV_KEYS) {
        saved[k] = process.env[k];
        delete process.env[k];
      }
    });
    afterEach(() => {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });

    it('is OFF by default: the fixed bypass code is rejected with 401', async () => {
      await makeUser('e2e');
      const res = await POST(mkReq({ exchange_code: 'e2e-bypass-code' }));
      expect(res.status).toBe(401);
    });

    it('when enabled, exchanges the fixed code for a token bound to the named user', async () => {
      const userId = await makeUser('e2e');
      process.env.BOOKKEEPRR_E2E_LOGIN_BYPASS = '1';
      process.env.BOOKKEEPRR_E2E_LOGIN_USERNAME = 'e2e';
      const res = await POST(mkReq({ exchange_code: 'e2e-bypass-code' }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      expect(await validateBearerToken(body.token)).toBe(userId);
    });

    it('when enabled without a username, falls back to the first user', async () => {
      const userId = await makeUser('only-user');
      process.env.BOOKKEEPRR_E2E_LOGIN_BYPASS = '1';
      const res = await POST(mkReq({ exchange_code: 'e2e-bypass-code' }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      expect(await validateBearerToken(body.token)).toBe(userId);
    });

    it('honors a custom BOOKKEEPRR_E2E_LOGIN_CODE', async () => {
      await makeUser('e2e');
      process.env.BOOKKEEPRR_E2E_LOGIN_BYPASS = '1';
      process.env.BOOKKEEPRR_E2E_LOGIN_USERNAME = 'e2e';
      process.env.BOOKKEEPRR_E2E_LOGIN_CODE = 'custom-code';
      expect((await POST(mkReq({ exchange_code: 'e2e-bypass-code' }))).status).toBe(401);
      expect((await POST(mkReq({ exchange_code: 'custom-code' }))).status).toBe(200);
    });

    it('when enabled, a non-bypass code still goes through normal validation', async () => {
      const userId = await makeUser('e2e');
      process.env.BOOKKEEPRR_E2E_LOGIN_BYPASS = '1';
      process.env.BOOKKEEPRR_E2E_LOGIN_USERNAME = 'e2e';
      // A real, freshly minted code must still work (proves the gate only
      // short-circuits the fixed bypass code, not all exchanges).
      const code = await createExchangeCode(userId);
      expect((await POST(mkReq({ exchange_code: code }))).status).toBe(200);
      // And a bogus code is still rejected.
      expect((await POST(mkReq({ exchange_code: 'nope' }))).status).toBe(401);
    });

    it('refuses the bypass when the resolved user is disabled', async () => {
      const userId = await makeUser('e2e');
      await updateUser(userId, { disabled: true });
      process.env.BOOKKEEPRR_E2E_LOGIN_BYPASS = '1';
      process.env.BOOKKEEPRR_E2E_LOGIN_USERNAME = 'e2e';
      expect((await POST(mkReq({ exchange_code: 'e2e-bypass-code' }))).status).toBe(401);
    });
  });

  describe('exchange-codes DAL', () => {
    it('consumeExchangeCode deletes the row regardless of validity (double-spend guard)', async () => {
      const userId = await makeUser();
      const code = await createExchangeCode(userId);
      expect(await consumeExchangeCode(code)).toBe(userId);
      expect(await consumeExchangeCode(code)).toBeNull();
    });

    it('consumeExchangeCode returns null and deletes the row for an expired code', async () => {
      const userId = await makeUser();
      const code = await createExchangeCode(userId, {
        expiresAtOverride: new Date(Date.now() - 1000),
      });
      expect(await consumeExchangeCode(code)).toBeNull();
      // Subsequent call is a no-op (row already removed by the first call).
      expect(await consumeExchangeCode(code)).toBeNull();
    });

    it('consumeExchangeCode tolerates empty / non-string input', async () => {
      expect(await consumeExchangeCode('')).toBeNull();
      expect(await consumeExchangeCode(undefined as unknown as string)).toBeNull();
    });
  });
});
