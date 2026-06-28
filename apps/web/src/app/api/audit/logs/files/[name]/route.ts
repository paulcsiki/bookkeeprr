import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { readLogFilePaged, isValidLogFileName } from '@/server/audit/log-files';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  before: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin(req);
  if ('status' in auth) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }
  const { name } = await ctx.params;
  if (!isValidLogFileName(name)) {
    return NextResponse.json({ message: 'invalid filename' }, { status: 400 });
  }
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: 'invalid query' }, { status: 400 });
  }
  try {
    const result = await readLogFilePaged(name, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ message: 'file not found' }, { status: 404 });
    }
    return NextResponse.json(
      { message: 'read failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
