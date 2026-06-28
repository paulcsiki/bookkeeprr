import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudClient } from '@/server/cloud/client';
import { logger } from '@/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const cfg = await cloudSettings.get();
  const client = new CloudClient(cfg.cloudBaseUrl, process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config');
  try {
    const terms = await client.getTerms();
    return NextResponse.json({ terms });
  } catch (err) {
    logger()
      .child({ component: 'settings-cloud-terms' })
      .warn(
        { err: err instanceof Error ? err.message : String(err) },
        'failed to fetch cloud terms',
      );
    return NextResponse.json(
      {
        message:
          err instanceof Error ? `Could not reach cloud (${err.message})` : 'Could not reach cloud',
      },
      { status: 502 },
    );
  }
}
