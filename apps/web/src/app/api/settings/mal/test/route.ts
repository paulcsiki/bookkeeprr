import { NextResponse } from 'next/server';
import { MalTestBody } from '@/server/openapi/schemas/settings';
import { malClientIdSetting } from '@/server/db/settings/mal';
import { searchMangaMal, MalError } from '@/server/integrations/mal';
import { requireAdmin } from '@/server/auth/require-admin';

// Optional clientId lets the user test before saving (mirrors qBittorrent's
// test, which sends the credentials in the body). When omitted, the stored
// Client ID is tested.

export async function POST(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = MalTestBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  // searchMangaMal reads the Client ID from settings. To test an unsaved value,
  // temporarily apply it and restore the stored value afterward.
  const override = parsed.data.clientId;
  const previous = override !== undefined ? await malClientIdSetting.get() : null;
  try {
    if (override !== undefined) await malClientIdSetting.set(override);
    await searchMangaMal('test');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof MalError ? err.message : (err as Error).message;
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  } finally {
    if (override !== undefined && previous !== null) await malClientIdSetting.set(previous);
  }
}
