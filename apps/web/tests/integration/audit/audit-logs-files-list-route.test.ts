import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET } from '@/app/api/audit/logs/files/route';
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

describe('GET /api/audit/logs/files', () => {
  let h: SeedHandle;
  let tmpDir: string;
  const ORIGINAL_CONFIG_DIR = process.env.BOOKKEEPRR_CONFIG_DIR;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bk-loglist-'));
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

  it('returns 401 for unauthenticated callers', async () => {
    const res = await GET(new Request('http://localhost/api/audit/logs/files'));
    expect(res.status).toBe(401);
  });

  it('returns the matching files sorted by mtime desc', async () => {
    const cookie = await adminCookie();
    const logsDir = join(tmpDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(join(logsDir, 'bookkeeprr.2026-05-25.1.log'), 'a');
    writeFileSync(join(logsDir, 'random.log'), 'b');
    const res = await GET(
      new Request('http://localhost/api/audit/logs/files', { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Array<{ name: string }> };
    expect(body.files).toHaveLength(1);
    expect(body.files[0]?.name).toBe('bookkeeprr.2026-05-25.1.log');
  });

  it('returns an empty array when logs dir is missing', async () => {
    const cookie = await adminCookie();
    const res = await GET(
      new Request('http://localhost/api/audit/logs/files', { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: unknown[] };
    expect(body.files).toEqual([]);
  });
});
