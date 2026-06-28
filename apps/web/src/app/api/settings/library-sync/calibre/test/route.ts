import { NextResponse } from 'next/server';
import { calibreSetting, isCalibreConfigured } from '@/server/db/settings/calibre';
import { refreshLibrary, CalibreError } from '@/server/library-sync/calibre';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const cfg = await calibreSetting.get();
  if (!isCalibreConfigured(cfg)) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  try {
    await refreshLibrary(
      { baseUrl: cfg.baseUrl!, username: cfg.username, password: cfg.password },
      cfg.libraryId,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof CalibreError ? err.message : (err as Error).message;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
