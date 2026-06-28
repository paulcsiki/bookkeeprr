import { NextResponse } from 'next/server';
import {
  getIndexer,
  updateIndexer,
  deleteIndexer,
  parseIndexerConfig,
  type IndexerKind,
  type IndexerConfig,
} from '@/server/db/indexers';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import { IndexerPatchBody } from '@/server/openapi/schemas/indexers';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const indexerId = Number(id);
  const indexer = await getIndexer(indexerId);
  if (!indexer) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = IndexerPatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  if (parsed.data.configJson && parsed.data.configJson.kind !== indexer.kind) {
    return NextResponse.json(
      { error: `kind mismatch: row is ${indexer.kind}, body is ${parsed.data.configJson.kind}` },
      { status: 400 },
    );
  }

  // Normalize the incoming config through parseIndexerConfig so optional
  // fields (e.g. pollIntervalSeconds) get their defaults applied.
  let finalConfig: IndexerConfig | undefined;
  if (parsed.data.configJson) {
    const normalized = parseIndexerConfig(
      JSON.stringify(parsed.data.configJson),
      parsed.data.configJson.kind,
    );

    // Secret preservation: a blank secret means "leave unchanged" (the GET route
    // masks secrets to '', so a save that didn't re-enter one must keep the
    // stored value rather than wipe it).
    if (
      normalized.kind === 'filelist' &&
      parsed.data.configJson.kind === 'filelist' &&
      parsed.data.configJson.passkey === ''
    ) {
      const existing = parseIndexerConfig(indexer.configJson, indexer.kind as IndexerKind);
      finalConfig =
        existing.kind === 'filelist' ? { ...normalized, passkey: existing.passkey } : normalized;
    } else if (
      normalized.kind === 'torznab' &&
      parsed.data.configJson.kind === 'torznab' &&
      parsed.data.configJson.apiKey === ''
    ) {
      const existing = parseIndexerConfig(indexer.configJson, indexer.kind as IndexerKind);
      finalConfig =
        existing.kind === 'torznab' ? { ...normalized, apiKey: existing.apiKey } : normalized;
    } else if (
      normalized.kind === 'mam' &&
      parsed.data.configJson.kind === 'mam' &&
      parsed.data.configJson.mamId === ''
    ) {
      const existing = parseIndexerConfig(indexer.configJson, indexer.kind as IndexerKind);
      finalConfig = existing.kind === 'mam' ? { ...normalized, mamId: existing.mamId } : normalized;
    } else {
      finalConfig = normalized;
    }
  }

  const beforeSnapshot = {
    enabled: indexer.enabled,
    name: indexer.name,
    configJson: parseIndexerConfig(indexer.configJson, indexer.kind as IndexerKind),
  };

  await updateIndexer(indexerId, {
    ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(finalConfig !== undefined ? { configJson: finalConfig } : {}),
  });

  const afterSnapshot = {
    enabled: parsed.data.enabled ?? indexer.enabled,
    name: parsed.data.name ?? indexer.name,
    configJson: finalConfig ?? beforeSnapshot.configJson,
  };

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'indexer.update',
    target: { kind: 'indexer', id: String(indexerId) },
    metadata: {
      changedFields: shallowDiff(
        beforeSnapshot as unknown as Record<string, unknown>,
        afterSnapshot as unknown as Record<string, unknown>,
      ),
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const indexerId = Number(id);
  const indexer = await getIndexer(indexerId);
  if (!indexer) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await deleteIndexer(indexerId);

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'indexer.delete',
    target: { kind: 'indexer', id: String(indexerId) },
    metadata: { kind: indexer.kind, name: indexer.name },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ ok: true });
}
