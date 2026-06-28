import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { queryAuditEvents } from '@/server/db/audit';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  action: z.string().optional(),
  actionPrefix: z.string().optional(),
  actorUserId: z.coerce.number().int().positive().optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid query parameters' }, { status: 400 });
  }
  const q = parsed.data;
  const { rows, total } = await queryAuditEvents(
    {
      action: q.action,
      actionPrefix: q.actionPrefix,
      actorUserId: q.actorUserId,
      from: q.from !== undefined ? new Date(q.from) : undefined,
      to: q.to !== undefined ? new Date(q.to) : undefined,
    },
    { limit: q.limit, offset: q.offset },
  );
  return NextResponse.json({ rows, total });
}
