import { NextResponse } from 'next/server';
import { listQualityProfiles } from '@/server/db/quality-profiles';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const rows = await listQualityProfiles();
  const mapped = rows.map((p) => ({
    id: p.id,
    name: p.name,
    upgradeAllowed: false,
    cutoff: 1,
    items: [],
  }));
  return NextResponse.json(mapped);
}
