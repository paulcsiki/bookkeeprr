/**
 * Integration tests: TOTP challenge step in login flow (web + mobile).
 *
 * Tests the full round-trip:
 *  setup → enable → login → assert requiresTotp → submit code → assert session issued
 * And:
 *  setup → enable → login → submit recovery code → assert session issued + code removed
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser, getUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import {
  generateSecret,
  generateRecoveryCodes,
  encryptSecret,
  hashRecoveryCode,
} from '@/server/auth/totp';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as loginTotp } from '@/app/api/auth/login/totp/route';
import { POST as mobileLoginTotp } from '@/app/api/mobile/auth/login/totp/route';
import { expectShape } from '../../helpers/assert-spec';
import { LoginResponse, LoginSuccessResponse } from '@/server/openapi/schemas/auth';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  process.env.BOOKKEEPRR_SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
});

afterEach(() => {
  h.cleanup();
  delete process.env.BOOKKEEPRR_SESSION_SECRET;
});

const PASSWORD = 'hunter22-correct';

async function makeLocalUser(username: string) {
  return insertUser({
    username,
    passwordHash: await hashPassword(PASSWORD),
    role: 'user',
    mustChangePassword: false,
  });
}

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function setupAndEnableTotp(userId: number): Promise<{
  secret: string;
  recoveryCodes: string[];
}> {
  const secret = generateSecret();
  const recoveryCodes = generateRecoveryCodes();
  const { updateUser } = await import('@/server/db/users');
  await updateUser(userId, {
    totpSecretEncrypted: encryptSecret(secret),
    totpEnabledAt: new Date(),
    totpRecoveryCodesHashed: JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
  });
  return { secret, recoveryCodes };
}

// ─── Web login flow ───────────────────────────────────────────────────────────

describe('login TOTP challenge (web)', () => {
  it('returns requiresTotp + challengeToken when TOTP is enabled', async () => {
    const user = await makeLocalUser('alice');
    await setupAndEnableTotp(user.id);

    const res = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'alice', password: PASSWORD }),
    );
    expect(res.status).toBe(200);
    await expectShape(LoginResponse, res, 'POST /api/auth/login (TOTP challenge)');
    const body = (await res.json()) as { requiresTotp: boolean; challengeToken: string };
    expect(body.requiresTotp).toBe(true);
    expect(typeof body.challengeToken).toBe('string');
    expect(body.challengeToken.length).toBeGreaterThan(0);
    // Should NOT set a session cookie
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain('bookkeeprr_session=');
  });

  it('issues session after correct TOTP code', async () => {
    const user = await makeLocalUser('bob');
    const { secret } = await setupAndEnableTotp(user.id);

    // Get the challenge token
    const loginRes = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'bob', password: PASSWORD }),
    );
    const { challengeToken } = (await loginRes.json()) as { challengeToken: string };

    // Generate the current TOTP code
    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const code = totp.generate();

    const totpRes = await loginTotp(
      jsonReq('http://localhost/api/auth/login/totp', { challengeToken, code }),
    );
    expect(totpRes.status).toBe(200);
    await expectShape(LoginSuccessResponse, totpRes, 'POST /api/auth/login/totp');
    const setCookie = totpRes.headers.get('set-cookie');
    expect(setCookie).toContain('bookkeeprr_session=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('returns 401 with wrong TOTP code', async () => {
    const user = await makeLocalUser('carol');
    await setupAndEnableTotp(user.id);

    const loginRes = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'carol', password: PASSWORD }),
    );
    const { challengeToken } = (await loginRes.json()) as { challengeToken: string };

    const totpRes = await loginTotp(
      jsonReq('http://localhost/api/auth/login/totp', { challengeToken, code: '000000' }),
    );
    expect(totpRes.status).toBe(401);
  });

  it('issues session using a recovery code (and removes it)', async () => {
    const user = await makeLocalUser('dave');
    const { recoveryCodes } = await setupAndEnableTotp(user.id);
    const recoveryCode = recoveryCodes[0]!;

    const loginRes = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'dave', password: PASSWORD }),
    );
    const { challengeToken } = (await loginRes.json()) as { challengeToken: string };

    const totpRes = await loginTotp(
      jsonReq('http://localhost/api/auth/login/totp', { challengeToken, code: recoveryCode }),
    );
    expect(totpRes.status).toBe(200);
    expect(totpRes.headers.get('set-cookie')).toContain('bookkeeprr_session=');

    // The used recovery code should be gone
    const updated = await getUser(user.id);
    const remaining = JSON.parse(updated!.totpRecoveryCodesHashed!) as string[];
    expect(remaining.length).toBe(9);
    expect(remaining.includes(hashRecoveryCode(recoveryCode))).toBe(false);
  });

  it('rejects an already-used recovery code (single-use)', async () => {
    const user = await makeLocalUser('eve');
    const { recoveryCodes } = await setupAndEnableTotp(user.id);
    const recoveryCode = recoveryCodes[1]!;

    // First use
    const loginRes1 = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'eve', password: PASSWORD }),
    );
    const { challengeToken: ct1 } = (await loginRes1.json()) as { challengeToken: string };
    const r1 = await loginTotp(
      jsonReq('http://localhost/api/auth/login/totp', { challengeToken: ct1, code: recoveryCode }),
    );
    expect(r1.status).toBe(200);

    // Second use (must fail)
    const loginRes2 = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'eve', password: PASSWORD }),
    );
    const { challengeToken: ct2 } = (await loginRes2.json()) as { challengeToken: string };
    const r2 = await loginTotp(
      jsonReq('http://localhost/api/auth/login/totp', { challengeToken: ct2, code: recoveryCode }),
    );
    expect(r2.status).toBe(401);
  });

  it('normal login (no TOTP) still works', async () => {
    await makeLocalUser('frank');
    const res = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'frank', password: PASSWORD }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('bookkeeprr_session=');
  });

  it('returns 401 for expired/invalid challenge token', async () => {
    const res = await loginTotp(
      jsonReq('http://localhost/api/auth/login/totp', {
        challengeToken: 'invalid.token.here',
        code: '123456',
      }),
    );
    expect(res.status).toBe(401);
  });
});

// ─── Mobile TOTP endpoint ─────────────────────────────────────────────────────

describe('mobile TOTP challenge', () => {
  it('issues a mobile token after correct TOTP code', async () => {
    const user = await makeLocalUser('grace');
    const { secret } = await setupAndEnableTotp(user.id);

    const loginRes = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'grace', password: PASSWORD }),
    );
    const { challengeToken } = (await loginRes.json()) as { challengeToken: string };

    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const code = totp.generate();

    const res = await mobileLoginTotp(
      jsonReq('http://localhost/api/mobile/auth/login/totp', { challengeToken, code }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; refreshToken: string; expiresAt: string };
    expect(typeof body.token).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(typeof body.expiresAt).toBe('string');
  });

  it('returns 401 with wrong TOTP code', async () => {
    const user = await makeLocalUser('heidi');
    await setupAndEnableTotp(user.id);

    const loginRes = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'heidi', password: PASSWORD }),
    );
    const { challengeToken } = (await loginRes.json()) as { challengeToken: string };

    const res = await mobileLoginTotp(
      jsonReq('http://localhost/api/mobile/auth/login/totp', {
        challengeToken,
        code: '000000',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('issues a mobile token using a recovery code', async () => {
    const user = await makeLocalUser('ivan');
    const { recoveryCodes } = await setupAndEnableTotp(user.id);

    const loginRes = await login(
      jsonReq('http://localhost/api/auth/login', { username: 'ivan', password: PASSWORD }),
    );
    const { challengeToken } = (await loginRes.json()) as { challengeToken: string };

    const res = await mobileLoginTotp(
      jsonReq('http://localhost/api/mobile/auth/login/totp', {
        challengeToken,
        code: recoveryCodes[0]!,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(typeof body.token).toBe('string');
  });
});
