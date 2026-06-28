import { NextResponse } from 'next/server';
import { NytTestBody } from '@/server/openapi/schemas/settings';
import { nytApiKeySetting } from '@/server/db/settings/nyt';
import { getAudioBestsellers, NytError } from '@/server/integrations/nyt';
import { requireAdmin } from '@/server/auth/require-admin';

// Optional apiKey lets the user test before saving (mirrors qBittorrent's test,
// which sends the credentials in the body). When omitted, the stored API key is
// tested.

export async function POST(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = NytTestBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  // getAudioBestsellers reads the API key from settings. To test an unsaved
  // value, temporarily apply it and restore the stored value afterward.
  const override = parsed.data.apiKey;
  const previous = override !== undefined ? await nytApiKeySetting.get() : null;
  try {
    if (override !== undefined) await nytApiKeySetting.set(override);
    await getAudioBestsellers();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof NytError ? err.message : (err as Error).message;
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  } finally {
    if (override !== undefined && previous !== null) await nytApiKeySetting.set(previous);
  }
}
