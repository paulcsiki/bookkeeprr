import { NextResponse } from 'next/server';
import { manualGrab, type ManualGrabInput } from '@/server/grabber/manual';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';
import { mapGrabErrorToHttp } from '@/app/api/_grab-helpers';
import { ManualGrabBody } from '@/server/openapi/schemas/series';

// A .torrent file is metadata only (piece hashes + file list); even huge
// multi-file torrents stay well under this. Anything bigger is not a torrent.
const MAX_TORRENT_BYTES = 2 * 1024 * 1024;

/**
 * Manual grab: the user supplies their own magnet link (JSON `{magnet}`) or a
 * `.torrent` file (multipart form-data field `torrent`) for this series.
 *
 * 201 {releaseId, downloadId} · 400 invalid input · 404 series not found ·
 * 409 duplicate (torrent already active/imported) · 503 qBittorrent
 * unconfigured · 502 qBittorrent add failed.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const seriesId = Number(id);

  let input: ManualGrabInput;
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: 'bad form data' }, { status: 400 });
    }
    const file = form.get('torrent');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'missing torrent file field' }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_TORRENT_BYTES) {
      return NextResponse.json(
        { error: 'torrent file must be between 1 byte and 2 MiB' },
        { status: 400 },
      );
    }
    input = { torrentBytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name };
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'bad json' }, { status: 400 });
    }
    const parsed = ManualGrabBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'magnet is required' }, { status: 400 });
    }
    input = { magnet: parsed.data.magnet };
  }

  const result = await manualGrab(seriesId, input);
  if (result.ok) {
    const actor = await auditActor(req);
    await recordAuditEvent({
      actor,
      action: 'release.manual_grab',
      target: { kind: 'release', id: String(result.result.releaseId) },
      metadata: { seriesId, qbtHash: result.result.qbtHash },
      context: auditContext(req),
    });
    return NextResponse.json(
      {
        releaseId: result.result.releaseId,
        downloadId: result.result.downloadId,
        qbtHash: result.result.qbtHash,
        status: 'queued',
      },
      { status: 201 },
    );
  }

  switch (result.error.code) {
    case 'series-not-found':
      return NextResponse.json({ error: result.error.message }, { status: 404 });
    case 'invalid-input':
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    case 'duplicate':
      return NextResponse.json({ error: result.error.message }, { status: 409 });
    default:
      return mapGrabErrorToHttp(result.error);
  }
}
