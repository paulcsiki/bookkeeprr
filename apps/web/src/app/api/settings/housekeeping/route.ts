import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { jobRetentionSetting, backupRetentionSetting } from '@/server/db/settings/housekeeping';
import { visibilityRetentionSetting } from '@/server/db/settings/visibility-retention';
import { releaseRetentionSetting } from '@/server/db/settings/release-retention';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const [jobs, backups, visibility, releases] = await Promise.all([
    jobRetentionSetting.get(),
    backupRetentionSetting.get(),
    visibilityRetentionSetting.get(),
    releaseRetentionSetting.get(),
  ]);
  return NextResponse.json({ jobs, backups, visibility, releases });
}
