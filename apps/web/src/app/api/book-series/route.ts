import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';
import { createBookSeries, listBookSeries } from '@/server/db/book-series';
import { CreateBookSeriesBody } from '@/server/openapi/schemas/book-series';
import { BookSeriesContentType, type BookSeriesSummary } from '@bookkeeprr/types';

export const dynamic = 'force-dynamic';

const toSummary = (r: {
  id: number; name: string; contentType: string;
  coverUrl: string | null; totalBooks: number | null;
  source: string; memberCount: number;
}): BookSeriesSummary => ({
  id: r.id,
  name: r.name,
  contentType: r.contentType as BookSeriesSummary['contentType'],
  coverUrl: r.coverUrl,
  totalBooks: r.totalBooks,
  memberCount: r.memberCount,
  source: r.source as BookSeriesSummary['source'],
});

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const ctParam = url.searchParams.get('contentType');
  const ct = ctParam ? BookSeriesContentType.safeParse(ctParam) : null;
  if (ctParam && !ct!.success) return NextResponse.json({ error: 'invalid contentType' }, { status: 400 });
  const rows = await listBookSeries(ct?.success ? { contentType: ct.data } : {});
  return NextResponse.json({ bookSeries: rows.map(toSummary) });
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  let body: z.infer<typeof CreateBookSeriesBody>;
  try { body = CreateBookSeriesBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? e.message : 'Invalid JSON body' }, { status: 400 }); }

  const row = await createBookSeries({
    name: body.name, contentType: body.contentType, source: 'manual',
    description: body.description ?? null, coverUrl: body.coverUrl ?? null,
  });
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'book_series.create', target: { kind: 'book_series', id: String(row.id) },
    metadata: { name: row.name, contentType: row.contentType }, context: auditContext(req),
  });
  return NextResponse.json(toSummary({ ...row, memberCount: 0 }), { status: 201 });
}
