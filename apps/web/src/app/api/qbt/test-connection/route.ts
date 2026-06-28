import { NextResponse } from 'next/server';
import { QbtTestConnectionBody } from '@/server/openapi/schemas/settings';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { testConnection, QbittorrentError } from '@/server/integrations/qbittorrent';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  // password optional: the GET route masks the stored password to '' so the form
  // sends a blank password on a Test when the user didn't re-type it. Fall back
  // to the stored password when blank, but keep the other submitted fields.
  const parsed = QbtTestConnectionBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  // Fall back to the stored password when the field was left blank. An empty
  // password is still allowed — qBittorrent can run passwordless (or with auth
  // bypassed for local subnets) — so we don't reject an empty result.
  const submitted = parsed.data.password ?? '';
  const password = submitted.length > 0 ? submitted : (await qbtConnectionSetting.get()).password;

  try {
    await testConnection({ ...parsed.data, password });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof QbittorrentError ? err.message : (err as Error).message;
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
