import { NextResponse } from 'next/server';
import { listCalendarEntries } from '@/server/db/calendar';
import { CalendarQuery } from '@/server/openapi/schemas/calendar';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = CalendarQuery.safeParse({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${parsed.data.to}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime())) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  }
  if (toExclusive <= from) {
    return NextResponse.json({ error: 'to must be after from' }, { status: 400 });
  }
  const entries = await listCalendarEntries(from, toExclusive);
  return NextResponse.json({ entries });
}
