import { NextResponse } from 'next/server';
import { MIN_SUPPORTED_MOBILE_VERSION, getCurrentServerVersion } from '@/server/mobile/version';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/version — anonymous. Drives the mobile update banner and
 * the boot-time version gate.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    current: getCurrentServerVersion(),
    min_supported: MIN_SUPPORTED_MOBILE_VERSION,
  });
}
