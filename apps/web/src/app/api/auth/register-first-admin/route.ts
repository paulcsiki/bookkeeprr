import { NextResponse } from 'next/server';
import { RegisterFirstAdminBody as Body } from '@/server/openapi/schemas/auth';
import { countUsers, insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword, validatePasswordPolicy } from '@/server/auth/password';
import { logLoginSuccess } from '@/server/auth/events';
import { setSessionCookie } from '@/server/auth/session-cookie';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }
  const policy = validatePasswordPolicy(parsed.data.password);
  if (!policy.ok) {
    return NextResponse.json({ message: policy.reason }, { status: 400 });
  }
  if ((await countUsers()) > 0) {
    return NextResponse.json({ message: 'First admin already registered' }, { status: 409 });
  }
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await insertUser({
      username: parsed.data.email,
      email: parsed.data.email,
      passwordHash,
      role: 'admin',
      mustChangePassword: false,
    });
    const session = await createSession({
      userId: user.id,
      userAgent: req.headers.get('user-agent'),
      ipAddress: req.headers.get('x-forwarded-for') ?? null,
    });
    logLoginSuccess({
      userId: user.id,
      username: user.username,
      ipAddress: req.headers.get('x-forwarded-for') ?? null,
      userAgent: req.headers.get('user-agent'),
    });
    const res = NextResponse.json(
      { user: { id: user.id, username: user.username, email: user.email, role: user.role } },
      { status: 201 },
    );
    setSessionCookie(res, session.token, req);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ message: 'Username already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Failed to create admin', detail: msg }, { status: 500 });
  }
}
