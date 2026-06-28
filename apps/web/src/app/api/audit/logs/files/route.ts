import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { listLogFiles } from '@/server/audit/log-files';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const files = await listLogFiles();
  return NextResponse.json({ files });
}
