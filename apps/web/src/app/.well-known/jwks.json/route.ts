import { NextResponse } from 'next/server';
import { loadOrCreateKeypair } from '@/server/cloud/key';

export const dynamic = 'force-dynamic';

function configDir(): string {
  return process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
}

export async function GET(): Promise<NextResponse> {
  const kp = await loadOrCreateKeypair(configDir());
  return NextResponse.json(
    { keys: [kp.publicJwk] },
    { headers: { 'Cache-Control': 's-maxage=600, public' } },
  );
}
