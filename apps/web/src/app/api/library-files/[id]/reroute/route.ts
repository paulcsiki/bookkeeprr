import { NextResponse } from 'next/server';
import { rerouteLibraryFile } from '@/server/importer/reroute';
import { LibraryFileRerouteBody } from '@/server/openapi/schemas/library';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const libraryFileId = Number(rawId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = LibraryFileRerouteBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  if ((parsed.data.volumeNumber === undefined) === (parsed.data.chapterNumber === undefined)) {
    return NextResponse.json(
      { error: 'provide exactly one of volumeNumber or chapterNumber' },
      { status: 400 },
    );
  }

  try {
    const result = await rerouteLibraryFile({
      libraryFileId,
      targetSeriesId: parsed.data.seriesId,
      volumeNumber: parsed.data.volumeNumber ?? null,
      chapterNumber: parsed.data.chapterNumber ?? null,
    });
    const actor = await auditActor(req);
    await recordAuditEvent({
      actor,
      action: 'library_file.reroute',
      target: { kind: 'library_file', id: String(libraryFileId) },
      context: auditContext(req),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/destination exists/i.test(message))
      return NextResponse.json({ error: message }, { status: 409 });
    if (/not found/i.test(message)) return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
