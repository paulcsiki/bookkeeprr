import { NextResponse } from 'next/server';
import { grabRelease } from '@/server/grabber';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';
import { mapGrabErrorToHttp } from '@/app/api/_grab-helpers';
import { InteractiveGrabBody } from '@/server/openapi/schemas/search';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const parsedBody = InteractiveGrabBody.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.message }, { status: 400 });
  }

  const { seriesId, item, parsed, score } = parsedBody.data;

  const releaseId = await upsertReleaseByGuid({
    indexerId: item.indexerId,
    indexerGuid: item.guid,
    seriesId,
    title: item.title,
    link: item.link,
    targetKind: parsed.targetKind,
    targetLow: parsed.targetLow,
    targetHigh: parsed.targetHigh,
    groupName: parsed.group,
    language: parsed.language,
    sizeBytes: item.sizeBytes,
    seeders: item.seeders,
    leechers: item.leechers,
    publishedAt: new Date(item.publishedAt),
    score: score ?? null,
  });

  const result = await grabRelease(releaseId);
  if (result.ok) {
    const actor = await auditActor(req);
    await recordAuditEvent({
      actor,
      action: 'release.grab',
      target: { kind: 'release', id: String(releaseId) },
      context: auditContext(req),
    });
    return NextResponse.json(
      { downloadId: result.result.downloadId, qbtHash: result.result.qbtHash, status: 'queued' },
      { status: 201 },
    );
  }
  return mapGrabErrorToHttp(result.error);
}
