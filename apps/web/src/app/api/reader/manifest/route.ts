import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { buildManifest } from '@/server/reader/manifest';
import type { ResolveError } from '@/server/reader/readable';

export const dynamic = 'force-dynamic';

const STATUS_FOR_ERROR: Record<ResolveError['error'], number> = {
  not_found: 404,
  forbidden: 403,
  unsupported: 415,
};

function parseId(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const volumeId = parseId(req.nextUrl.searchParams.get('volumeId'));
  const fileId = parseId(req.nextUrl.searchParams.get('fileId'));

  // Require exactly one of volumeId / fileId.
  if ((volumeId === null) === (fileId === null)) {
    return NextResponse.json(
      { error: 'provide exactly one of volumeId or fileId' },
      { status: 400 },
    );
  }

  const result = await buildManifest(
    volumeId !== null ? { volumeId } : { fileId: fileId! },
    userId,
  );
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: STATUS_FOR_ERROR[result.error] });
  }
  return NextResponse.json(result, { status: 200 });
}
