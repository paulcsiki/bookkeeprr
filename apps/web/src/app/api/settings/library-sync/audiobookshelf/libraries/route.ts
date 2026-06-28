import { NextResponse } from 'next/server';
import { audiobookshelfSetting } from '@/server/db/settings/audiobookshelf';
import { listLibraries, AudiobookshelfError } from '@/server/library-sync/audiobookshelf';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const cfg = await audiobookshelfSetting.get();
  if (!cfg.baseUrl || !cfg.apiToken) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  try {
    const libraries = await listLibraries({ baseUrl: cfg.baseUrl, apiToken: cfg.apiToken });
    return NextResponse.json({ libraries });
  } catch (err) {
    const message = err instanceof AudiobookshelfError ? err.message : (err as Error).message;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
