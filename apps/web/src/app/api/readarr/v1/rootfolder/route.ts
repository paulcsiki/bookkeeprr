import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { contentTypeSubdir, getMediaRoot } from '@/server/content-type/paths';
import { READARR_CONTENT_TYPES } from '@/server/readarr/profiles';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const mediaRoot = await getMediaRoot();
  const folders = READARR_CONTENT_TYPES.map((ct, i) => ({
    id: i + 1,
    path: join(mediaRoot, contentTypeSubdir(ct)),
    accessible: true,
    freeSpace: 0,
    totalSpace: 0,
  }));
  return NextResponse.json(folders);
}
