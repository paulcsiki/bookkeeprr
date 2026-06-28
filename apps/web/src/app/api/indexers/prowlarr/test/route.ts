import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { testProwlarr, ProwlarrError } from '@/server/integrations/prowlarr';
import { prowlarrConnectionSetting } from '@/server/db/settings/prowlarr';
// ProwlarrTestBody: url/apiKey optional — blank fields fall back to the stored
// connection so a Test works without re-entering the masked key.
import { ProwlarrTestBody } from '@/server/openapi/schemas/indexers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const parsed = ProwlarrTestBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const stored = await prowlarrConnectionSetting.get();
  const url = parsed.data.url && parsed.data.url.length > 0 ? parsed.data.url : stored.url;
  const apiKey = parsed.data.apiKey && parsed.data.apiKey.length > 0 ? parsed.data.apiKey : stored.apiKey;
  if (url.length === 0 || apiKey.length === 0) {
    return NextResponse.json({ error: 'Prowlarr URL and API key required' }, { status: 400 });
  }

  try {
    await testProwlarr({ url, apiKey });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof ProwlarrError ? err.message : (err as Error).message;
    return NextResponse.json({ error: `prowlarr test failed: ${msg}` }, { status: 502 });
  }
}
