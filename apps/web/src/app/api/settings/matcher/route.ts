import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { scoringWeightsSetting, adultFilterSetting } from '@/server/db/settings/matcher';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const [weights, adultFilter] = await Promise.all([
    scoringWeightsSetting.get(),
    adultFilterSetting.get(),
  ]);
  return NextResponse.json({ weights, adultFilter });
}
