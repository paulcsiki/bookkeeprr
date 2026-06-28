import { NextResponse } from 'next/server';
import { ComicVineTestConnectionBody } from '@/server/openapi/schemas/settings';
import { testApiKey, ComicVineError } from '@/server/integrations/comicvine';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';

// apiKey optional: the GET route masks the stored key to '' so the form sends a
// blank key on a Test when the user didn't re-type it. Fall back to the stored
// key when the submitted one is blank.

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = ComicVineTestConnectionBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const submitted = parsed.data.apiKey ?? '';
  const apiKey = submitted.length > 0 ? submitted : await comicVineApiKeySetting.get();
  if (apiKey.length === 0) {
    return NextResponse.json({ error: 'API key required' }, { status: 400 });
  }

  try {
    await testApiKey(apiKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof ComicVineError ? err.message : (err as Error).message;
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
