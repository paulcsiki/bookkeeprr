import { NextResponse } from 'next/server';
import {
  listIndexers,
  insertIndexer,
  parseIndexerConfig,
  type IndexerKind,
} from '@/server/db/indexers';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import { IndexerCreateBody } from '@/server/openapi/schemas/indexers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  // The 'manual' sentinel indexer is internal (holds hand-added torrents); never
  // surface it in the indexers admin list.
  const rows = (await listIndexers()).filter((r) => r.kind !== 'manual');
  return NextResponse.json({
    indexers: rows.map((r) => {
      const cfg = parseIndexerConfig(r.configJson, r.kind as IndexerKind);
      const masked =
        cfg.kind === 'filelist'
          ? { ...cfg, passkey: '' }
          : cfg.kind === 'torznab'
            ? { ...cfg, apiKey: '' }
            : cfg.kind === 'mam'
              ? { ...cfg, mamId: '' }
              : cfg;
      return {
        id: r.id,
        kind: r.kind,
        name: r.name,
        baseUrl: r.baseUrl,
        enabled: r.enabled,
        configJson: JSON.stringify(masked),
        lastRssAt: r.lastRssAt?.toISOString() ?? null,
        lastSearchAt: r.lastSearchAt?.toISOString() ?? null,
      };
    }),
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const parsed = IndexerCreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  if (parsed.data.kind !== parsed.data.configJson.kind) {
    return NextResponse.json(
      {
        error: `kind mismatch: body.kind=${parsed.data.kind} but configJson.kind=${parsed.data.configJson.kind}`,
      },
      { status: 400 },
    );
  }

  const id = await insertIndexer({
    kind: parsed.data.kind,
    name: parsed.data.name,
    baseUrl: parsed.data.baseUrl,
    enabled: parsed.data.enabled,
    configJson: parsed.data.configJson,
  });

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'indexer.create',
    target: { kind: 'indexer', id: String(id) },
    metadata: { kind: parsed.data.kind, name: parsed.data.name },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({ id }, { status: 201 });
}
