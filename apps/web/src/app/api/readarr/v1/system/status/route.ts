import { NextResponse } from 'next/server';
import pkg from '../../../../../../../package.json' with { type: 'json' };

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    version: (pkg as { version: string }).version,
    appName: 'bookkeeprr',
    buildTime: new Date().toISOString(),
    isDocker: process.env.BOOKKEEPRR_CONFIG_DIR === '/config',
    runtimeVersion: process.version,
    startTime: new Date().toISOString(),
  });
}
