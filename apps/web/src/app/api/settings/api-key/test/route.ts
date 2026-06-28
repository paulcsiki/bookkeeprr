import { NextResponse } from 'next/server';
import { apiKeySetting, isApiKeyEnabled } from '@/server/db/settings/api-key';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const provided = req.headers.get('x-api-key');
  const cfg = await apiKeySetting.get();
  if (!isApiKeyEnabled(cfg)) {
    return NextResponse.json({ ok: true, note: 'auth disabled — any request would succeed' });
  }
  if (provided === cfg.key) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: 'key mismatch' }, { status: 401 });
}
