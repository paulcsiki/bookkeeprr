import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

/** Creates a fresh admin user and returns the session cookie string. */
export async function adminCookie(): Promise<string> {
  const u = await insertUser({
    username: `admin${crypto.randomUUID().slice(0, 8)}`,
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}
