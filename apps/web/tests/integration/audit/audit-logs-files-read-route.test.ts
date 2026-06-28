import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET } from '@/app/api/audit/logs/files/[name]/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

async function adminCookie(): Promise<string> {
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

describe('GET /api/audit/logs/files/[name]', () => {
  let h: SeedHandle;
  let tmpDir: string;
  const ORIGINAL_CONFIG_DIR = process.env.BOOKKEEPRR_CONFIG_DIR;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bk-logread-'));
    process.env.BOOKKEEPRR_CONFIG_DIR = tmpDir;
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => {
    h.cleanup();
    rmSync(tmpDir, { recursive: true, force: true });
    if (ORIGINAL_CONFIG_DIR === undefined) {
      delete process.env.BOOKKEEPRR_CONFIG_DIR;
    } else {
      process.env.BOOKKEEPRR_CONFIG_DIR = ORIGINAL_CONFIG_DIR;
    }
  });

  it('returns 400 for path-traversal attempts', async () => {
    const cookie = await adminCookie();
    const res = await GET(
      new Request('http://localhost/api/audit/logs/files/...', { headers: { cookie } }),
      { params: Promise.resolve({ name: '../etc/passwd' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for filenames not matching the regex', async () => {
    const cookie = await adminCookie();
    const res = await GET(
      new Request('http://localhost/api/audit/logs/files/bad.log', { headers: { cookie } }),
      { params: Promise.resolve({ name: 'random.log' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for a valid filename that does not exist', async () => {
    const cookie = await adminCookie();
    const res = await GET(
      new Request('http://localhost/api/audit/logs/files/bookkeeprr.2026-05-25.1.log', {
        headers: { cookie },
      }),
      { params: Promise.resolve({ name: 'bookkeeprr.2026-05-25.1.log' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns the tail of a real file', async () => {
    const cookie = await adminCookie();
    const logsDir = join(tmpDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    writeFileSync(join(logsDir, 'bookkeeprr.2026-05-25.1.log'), content);
    const res = await GET(
      new Request('http://localhost/api/audit/logs/files/bookkeeprr.2026-05-25.1.log?limit=10', {
        headers: { cookie },
      }),
      { params: Promise.resolve({ name: 'bookkeeprr.2026-05-25.1.log' }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lines: string[]; hasMore: boolean };
    expect(body.lines.length).toBe(10);
    expect(body.lines[body.lines.length - 1]).toBe('line 100');
    expect(body.hasMore).toBe(true);
  });

  it('returns 401 unauthenticated / 403 non-admin', async () => {
    const u = await insertUser({
      username: 'u',
      passwordHash: await hashPassword('pwd12345'),
      role: 'user',
      mustChangePassword: false,
    });
    const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
    const userCookieStr = `bookkeeprr_session=${s.token}`;

    const res401 = await GET(
      new Request('http://localhost/api/audit/logs/files/bookkeeprr.2026-05-25.1.log', {}),
      { params: Promise.resolve({ name: 'bookkeeprr.2026-05-25.1.log' }) },
    );
    expect(res401.status).toBe(401);

    const res403 = await GET(
      new Request('http://localhost/api/audit/logs/files/bookkeeprr.2026-05-25.1.log', {
        headers: { cookie: userCookieStr },
      }),
      { params: Promise.resolve({ name: 'bookkeeprr.2026-05-25.1.log' }) },
    );
    expect(res403.status).toBe(403);
  });
});
