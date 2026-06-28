import { NextResponse } from 'next/server';
import { buildGroupSummaries } from '@/server/scan-groups';

export { type GroupFile, type GroupSummary } from '@/server/scan-groups';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const groups = await buildGroupSummaries();
  return NextResponse.json({ groups }, { status: 200 });
}
