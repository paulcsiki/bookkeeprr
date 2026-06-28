import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { getDb } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { getMediaRoot } from '@/server/content-type/paths';

export const dynamic = 'force-dynamic';

function extToMime(ext: string): string {
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  // Any authenticated user can read any avatar (public identity icons).
  const result = await authenticateRequest(req as Parameters<typeof authenticateRequest>[0]);
  if (result.kind !== 'authenticated') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { userId: userIdStr } = await params;
  const userId = parseInt(userIdStr, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }

  const [user] = await getDb()
    .select({ avatarPath: users.avatarPath })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.avatarPath) {
    return NextResponse.json({ message: 'No avatar set' }, { status: 404 });
  }

  // BOOKKEEPRR_MEDIA_ROOT is resolved from env at runtime, not build time;
  // the turbopackIgnore hint stops the Turbopack NFT tracer from pulling
  // the whole project into the route bundle while trying to enumerate the
  // possible media-root contents.
  const fullPath = join(/* turbopackIgnore: true */ await getMediaRoot(), user.avatarPath);
  try {
    await stat(fullPath);
  } catch {
    return NextResponse.json({ message: 'Avatar file not found' }, { status: 404 });
  }

  const data = await readFile(fullPath);
  const ext = user.avatarPath.split('.').pop() ?? '';
  const mime = extToMime(ext);

  return new NextResponse(data, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
