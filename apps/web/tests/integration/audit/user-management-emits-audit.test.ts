import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST as createUserPost } from '@/app/api/users/route';
import { PATCH as patchUser, DELETE as deleteUser } from '@/app/api/users/[id]/route';
import { POST as resetPasswordPost } from '@/app/api/users/[id]/reset-password/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { queryAuditEvents } from '@/server/db/audit';

async function adminCookie(): Promise<{ cookie: string; adminId: number }> {
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return { cookie: `bookkeeprr_session=${s.token}`, adminId: admin.id };
}

async function flushAuditWrite(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe('User management routes emit audit events', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('POST /api/users emits user.create', async () => {
    const { cookie, adminId } = await adminCookie();
    const res = await createUserPost(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'pwd12345', role: 'user' }),
      }),
    );
    expect(res.ok).toBe(true);
    await flushAuditWrite();
    const { rows } = await queryAuditEvents({ action: 'user.create' }, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorUserId).toBe(adminId);
    expect(rows[0]?.actorUsername).toBe('admin');
    const meta = JSON.parse(rows[0]!.metadataJson!);
    expect(meta.username).toBe('alice');
    expect(meta.role).toBe('user');
  });

  it('PATCH /api/users/[id] emits user.update with changedFields', async () => {
    const { cookie } = await adminCookie();
    const u = await insertUser({
      username: 'bob',
      passwordHash: await hashPassword('pwd12345'),
      role: 'user',
      mustChangePassword: false,
    });
    const res = await patchUser(
      new Request(`http://localhost/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      }),
      { params: Promise.resolve({ id: String(u.id) }) },
    );
    expect(res.ok).toBe(true);
    await flushAuditWrite();
    const { rows } = await queryAuditEvents({ action: 'user.update' }, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    const meta = JSON.parse(rows[0]!.metadataJson!);
    expect(meta.changedFields).toContain('role');
    expect(rows[0]?.targetKind).toBe('user');
    expect(rows[0]?.targetId).toBe(String(u.id));
  });

  it('DELETE /api/users/[id] emits user.delete with deletedUsername', async () => {
    const { cookie } = await adminCookie();
    const u = await insertUser({
      username: 'charlie',
      passwordHash: await hashPassword('pwd12345'),
      role: 'user',
      mustChangePassword: false,
    });
    const res = await deleteUser(
      new Request(`http://localhost/api/users/${u.id}`, { method: 'DELETE', headers: { cookie } }),
      { params: Promise.resolve({ id: String(u.id) }) },
    );
    expect(res.ok).toBe(true);
    await flushAuditWrite();
    const { rows } = await queryAuditEvents({ action: 'user.delete' }, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    const meta = JSON.parse(rows[0]!.metadataJson!);
    expect(meta.deletedUsername).toBe('charlie');
    expect(rows[0]?.targetKind).toBe('user');
    expect(rows[0]?.targetId).toBe(String(u.id));
  });

  it('POST /api/users/[id]/reset-password emits user.reset_password', async () => {
    const { cookie } = await adminCookie();
    const u = await insertUser({
      username: 'dave',
      passwordHash: await hashPassword('pwd12345'),
      role: 'user',
      mustChangePassword: false,
    });
    const res = await resetPasswordPost(
      new Request(`http://localhost/api/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: 'newpwd12345', mustChangePassword: true }),
      }),
      { params: Promise.resolve({ id: String(u.id) }) },
    );
    expect(res.ok).toBe(true);
    await flushAuditWrite();
    const { rows } = await queryAuditEvents(
      { action: 'user.reset_password' },
      { limit: 10, offset: 0 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetKind).toBe('user');
    expect(rows[0]?.targetId).toBe(String(u.id));
  });
});
