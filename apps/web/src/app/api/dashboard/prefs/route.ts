import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { getDashboardPrefs, setDashboardPrefs } from '@/server/db/dashboard-prefs';
import { validatePrefs } from '@/components/dashboard/widget-registry';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const prefs = await getDashboardPrefs(userId);
  return NextResponse.json(prefs, { status: 200 });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const validation = validatePrefs(body);
  if (!validation.ok) {
    return NextResponse.json({ error: 'invalid payload', detail: validation.error }, { status: 400 });
  }

  const prefs = await setDashboardPrefs(userId, validation.value);
  return NextResponse.json(prefs, { status: 200 });
}
