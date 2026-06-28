import { NextResponse } from 'next/server';
import { FlaresolverrTestBody } from '@/server/openapi/schemas/settings';
import { flaresolverrSetting } from '@/server/db/settings/flaresolverr';
import { solveGet, FlaresolverrError } from '@/server/integrations/flaresolverr/client';
import { requireAdmin } from '@/server/auth/require-admin';

// Optional url lets the user test before saving (mirrors qBittorrent's test,
// which sends the credentials in the body). When omitted, the stored URL is used.

const PROBE_URL = 'https://www.novelupdates.com/';

export async function POST(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = FlaresolverrTestBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const url = parsed.data.url ?? (await flaresolverrSetting.get()).url;
  if (url.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'No FlareSolverr URL configured' }, { status: 502 });
  }

  try {
    await solveGet(url, PROBE_URL);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof FlaresolverrError ? err.message : (err as Error).message;
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
