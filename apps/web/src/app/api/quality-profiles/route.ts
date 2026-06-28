import { NextResponse } from 'next/server';
import { listQualityProfiles } from '@/server/db/quality-profiles';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const rows = await listQualityProfiles();
  return NextResponse.json(rows);
}
