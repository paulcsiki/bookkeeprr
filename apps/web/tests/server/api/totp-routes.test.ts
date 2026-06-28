import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser, getUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { encryptSecret, generateRecoveryCodes, hashRecoveryCode } from '@/server/auth/totp';
import { POST as setup } from '@/app/api/auth/me/totp/setup/route';
import { POST as enable } from '@/app/api/auth/me/totp/enable/route';
import { DELETE as disable } from '@/app/api/auth/me/totp/route';
import { POST as regenerate } from '@/app/api/auth/me/totp/recovery-codes/regenerate/route';
import { expectShape } from '../../helpers/assert-spec';
import {
  AuthOkResponse,
  RecoveryCodesResponse,
  TotpSetupResponse,
} from '@/server/openapi/schemas/auth';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  process.env.BOOKKEEPRR_SESSION_SECRET = 'test-session-secret-at-least-32-chars';
});
afterEach(() => {
  h.cleanup();
  delete process.env.BOOKKEEPRR_SESSION_SECRET;
});

async function makeUserWithSession(
  username = 'alice',
  password = 'hunter22-correct',
): Promise<{ userId: number; cookie: string; passwordHash: string }> {
  const passwordHash = await hashPassword(password);
  const user = await insertUser({
    username,
    passwordHash,
    role: 'user',
    mustChangePassword: false,
  });
  const session = await createSession({ userId: user.id, userAgent: null, ipAddress: null });
  return { userId: user.id, cookie: `bookkeeprr_session=${session.token}`, passwordHash };
}

function withCookiesShim(req: Request, cookie: string | null): Request {
  const cookieMap: Record<string, string> = {};
  if (cookie !== null) {
    for (const part of cookie.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k) cookieMap[k.trim()] = rest.join('=');
    }
  }
  Object.defineProperty(req, 'cookies', {
    value: { get: (name: string) => (cookieMap[name] ? { value: cookieMap[name] } : undefined) },
    configurable: true,
  });
  return req;
}

function jsonReq(
  url: string,
  method: string,
  cookie: string | null,
  body?: unknown,
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return withCookiesShim(
    new Request(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    cookie,
  ) as Request;
}

// ─── /setup ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/me/totp/setup', () => {
  it('returns secret + otpauthUri + qrCodeDataUrl + recoveryCodes for authed user', async () => {
    const { cookie } = await makeUserWithSession();
    const res = await setup(jsonReq('http://localhost/api/auth/me/totp/setup', 'POST', cookie) as Parameters<typeof setup>[0]);
    expect(res.status).toBe(200);
    await expectShape(TotpSetupResponse, res, 'POST /api/auth/me/totp/setup');
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.secret).toBe('string');
    expect(typeof body.otpauthUri).toBe('string');
    expect((body.otpauthUri as string).startsWith('otpauth://totp/')).toBe(true);
    expect(typeof body.qrCodeDataUrl).toBe('string');
    expect((body.qrCodeDataUrl as string).startsWith('data:image/png;base64,')).toBe(true);
    expect(Array.isArray(body.recoveryCodes)).toBe(true);
    expect((body.recoveryCodes as string[]).length).toBe(10);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await setup(jsonReq('http://localhost/api/auth/me/totp/setup', 'POST', null) as Parameters<typeof setup>[0]);
    expect(res.status).toBe(401);
  });
});

// ─── /enable ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/me/totp/enable', () => {
  it('enables TOTP when a valid code is provided', async () => {
    const { userId, cookie } = await makeUserWithSession();

    // Generate a real secret + code
    const secret = 'JBSWY3DPEHPK3PXP';
    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const code = totp.generate();
    const recoveryCodes = generateRecoveryCodes();

    const res = await enable(
      jsonReq('http://localhost/api/auth/me/totp/enable', 'POST', cookie, {
        secret,
        code,
        recoveryCodes,
      }) as Parameters<typeof enable>[0],
    );
    expect(res.status).toBe(200);
    await expectShape(AuthOkResponse, res, 'POST /api/auth/me/totp/enable');
    expect((await res.json()) as unknown).toMatchObject({ ok: true });

    const user = await getUser(userId);
    expect(user?.totpEnabledAt).not.toBeNull();
    expect(user?.totpSecretEncrypted).not.toBeNull();
    expect(user?.totpRecoveryCodesHashed).not.toBeNull();
  });

  it('returns 422 for an invalid code', async () => {
    const { cookie } = await makeUserWithSession();
    const secret = 'JBSWY3DPEHPK3PXP';
    const recoveryCodes = generateRecoveryCodes();

    const res = await enable(
      jsonReq('http://localhost/api/auth/me/totp/enable', 'POST', cookie, {
        secret,
        code: '000000',
        recoveryCodes,
      }) as Parameters<typeof enable>[0],
    );
    expect(res.status).toBe(422);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await enable(
      jsonReq('http://localhost/api/auth/me/totp/enable', 'POST', null, {
        secret: 'X',
        code: '123456',
        recoveryCodes: [],
      }) as Parameters<typeof enable>[0],
    );
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /totp ─────────────────────────────────────────────────────────────

describe('DELETE /api/auth/me/totp', () => {
  async function enableTotp(userId: number): Promise<void> {
    const secret = 'JBSWY3DPEHPK3PXP';
    const hashed = generateRecoveryCodes().map(hashRecoveryCode);
    const { updateUser } = await import('@/server/db/users');
    await updateUser(userId, {
      totpSecretEncrypted: encryptSecret(secret),
      totpEnabledAt: new Date(),
      totpRecoveryCodesHashed: JSON.stringify(hashed),
    });
  }

  it('disables TOTP when correct password is provided', async () => {
    const { userId, cookie } = await makeUserWithSession('bob', 'hunter22-correct');
    await enableTotp(userId);

    const res = await disable(
      jsonReq('http://localhost/api/auth/me/totp', 'DELETE', cookie, {
        password: 'hunter22-correct',
      }) as Parameters<typeof disable>[0],
    );
    expect(res.status).toBe(200);
    await expectShape(AuthOkResponse, res, 'DELETE /api/auth/me/totp');

    const user = await getUser(userId);
    expect(user?.totpEnabledAt).toBeNull();
    expect(user?.totpSecretEncrypted).toBeNull();
    expect(user?.totpRecoveryCodesHashed).toBeNull();
  });

  it('returns 401 when wrong password is provided', async () => {
    const { userId, cookie } = await makeUserWithSession('carol', 'correct-password');
    await enableTotp(userId);

    const res = await disable(
      jsonReq('http://localhost/api/auth/me/totp', 'DELETE', cookie, {
        password: 'wrong-password',
      }) as Parameters<typeof disable>[0],
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await disable(
      jsonReq('http://localhost/api/auth/me/totp', 'DELETE', null, {
        password: 'anything',
      }) as Parameters<typeof disable>[0],
    );
    expect(res.status).toBe(401);
  });
});

// ─── /recovery-codes/regenerate ───────────────────────────────────────────────

describe('POST /api/auth/me/totp/recovery-codes/regenerate', () => {
  async function enableTotp(userId: number): Promise<void> {
    const secret = 'JBSWY3DPEHPK3PXP';
    const hashed = generateRecoveryCodes().map(hashRecoveryCode);
    const { updateUser } = await import('@/server/db/users');
    await updateUser(userId, {
      totpSecretEncrypted: encryptSecret(secret),
      totpEnabledAt: new Date(),
      totpRecoveryCodesHashed: JSON.stringify(hashed),
    });
  }

  it('returns 10 new recovery codes with correct password', async () => {
    const { userId, cookie } = await makeUserWithSession('dave', 'hunter22-correct');
    await enableTotp(userId);

    const res = await regenerate(
      jsonReq(
        'http://localhost/api/auth/me/totp/recovery-codes/regenerate',
        'POST',
        cookie,
        { password: 'hunter22-correct' },
      ) as Parameters<typeof regenerate>[0],
    );
    expect(res.status).toBe(200);
    await expectShape(RecoveryCodesResponse, res, 'POST /api/auth/me/totp/recovery-codes/regenerate');
    const body = (await res.json()) as { recoveryCodes: string[] };
    expect(body.recoveryCodes.length).toBe(10);
  });

  it('returns 401 for wrong password', async () => {
    const { userId, cookie } = await makeUserWithSession('eve', 'correct-password');
    await enableTotp(userId);

    const res = await regenerate(
      jsonReq(
        'http://localhost/api/auth/me/totp/recovery-codes/regenerate',
        'POST',
        cookie,
        { password: 'wrong-password' },
      ) as Parameters<typeof regenerate>[0],
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when TOTP is not enabled', async () => {
    const { cookie } = await makeUserWithSession('frank', 'correct-password');

    const res = await regenerate(
      jsonReq(
        'http://localhost/api/auth/me/totp/recovery-codes/regenerate',
        'POST',
        cookie,
        { password: 'correct-password' },
      ) as Parameters<typeof regenerate>[0],
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await regenerate(
      jsonReq(
        'http://localhost/api/auth/me/totp/recovery-codes/regenerate',
        'POST',
        null,
        { password: 'anything' },
      ) as Parameters<typeof regenerate>[0],
    );
    expect(res.status).toBe(401);
  });
});
