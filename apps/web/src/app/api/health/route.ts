import { NextResponse } from 'next/server';
import { computeHealth } from '@/server/health';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const result = await computeHealth();
  const code = result.status === 'healthy' ? 200 : 503;
  return NextResponse.json(result, { status: code });
}
