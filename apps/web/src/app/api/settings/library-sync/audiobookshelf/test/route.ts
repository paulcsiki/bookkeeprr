import { NextResponse } from 'next/server';
import {
  audiobookshelfSetting,
  isAudiobookshelfConfigured,
} from '@/server/db/settings/audiobookshelf';
import { scanLibrary, AudiobookshelfError } from '@/server/library-sync/audiobookshelf';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const cfg = await audiobookshelfSetting.get();
  if (!isAudiobookshelfConfigured(cfg)) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  try {
    await scanLibrary({ baseUrl: cfg.baseUrl!, apiToken: cfg.apiToken! }, cfg.libraryId!);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof AudiobookshelfError ? err.message : (err as Error).message;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
