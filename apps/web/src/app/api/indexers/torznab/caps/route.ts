import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { fetchTorznabCaps, TorznabError } from '@/server/integrations/torznab';
import { getIndexer, parseIndexerConfig } from '@/server/db/indexers';
import { TorznabCapsBody } from '@/server/openapi/schemas/indexers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = TorznabCapsBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  let apiKey = parsed.data.apiKey;
  if (apiKey === '' && parsed.data.indexerId !== undefined) {
    const row = await getIndexer(parsed.data.indexerId);
    if (row) {
      const cfg = parseIndexerConfig(row.configJson, 'torznab');
      if (cfg.kind === 'torznab') apiKey = cfg.apiKey;
    }
  }
  if (apiKey === '') {
    return NextResponse.json({ error: 'API key required' }, { status: 400 });
  }

  try {
    const caps = await fetchTorznabCaps({ url: parsed.data.url, apiKey });
    return NextResponse.json(caps);
  } catch (err) {
    const msg = err instanceof TorznabError ? err.message : (err as Error).message;
    return NextResponse.json({ error: `caps failed: ${msg}` }, { status: 502 });
  }
}
