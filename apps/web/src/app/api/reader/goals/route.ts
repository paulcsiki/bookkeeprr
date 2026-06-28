import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/server/auth/require-user';
import { getGoals, setGoals } from '@/server/db/reading-goals';

export const dynamic = 'force-dynamic';

// Each goal is a non-negative integer, or null to clear it. Omitting a key
// leaves the existing value untouched.
const PutBody = z
  .object({
    yearlyBooks: z.number().int().min(0).nullable().optional(),
    weeklyMinutes: z.number().int().min(0).nullable().optional(),
    streakDays: z.number().int().min(0).nullable().optional(),
  })
  .strict();

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const goals = await getGoals(userId);
  return NextResponse.json(goals, { status: 200 });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body;
  try {
    body = PutBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const goals = await setGoals(userId, body);
  return NextResponse.json(goals, { status: 200 });
}
