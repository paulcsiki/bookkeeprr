import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { jobs } from '@/server/db/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const numId = Number.parseInt(id, 10);
  if (numId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const rows = await getDb().select().from(jobs).where(eq(jobs.id, numId)).limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(rows[0], { status: 200 });
}
