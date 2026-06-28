import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser, updateUser } from '@/server/db/users';
import { readSessionCookie } from '@/server/auth/session-cookie';

export const dynamic = 'force-dynamic';

async function resolveUserId(req: Request): Promise<number | null> {
  const token = readSessionCookie(req);
  if (token === null) return null;
  const session = await getSessionByToken(token);
  if (session === null || session.expiresAt <= new Date()) return null;
  const user = await getUser(session.userId);
  if (user === null || user.disabled) return null;
  return user.id;
}

export async function GET(req: Request): Promise<NextResponse> {
  const userId = await resolveUserId(req);
  if (userId === null) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const user = await getUser(userId);
  return NextResponse.json({ version: user?.lastSeenChangelogVersion ?? null });
}

const PostBody = z.object({ version: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  const userId = await resolveUserId(req);
  if (userId === null) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
  }
  const parsed = PostBody.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
  await updateUser(userId, { lastSeenChangelogVersion: parsed.data.version });
  return NextResponse.json({ ok: true });
}
