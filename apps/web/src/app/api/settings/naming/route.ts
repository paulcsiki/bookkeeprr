import { NextResponse } from 'next/server';
import { NamingPutBody } from '@/server/openapi/schemas/settings';
import {
  NAMING_KEYS_BY_TYPE,
  getAllNamingTemplates,
  setAllNamingTemplates,
  type NamingKey,
} from '@/server/db/settings/naming';
import { type ContentType, isContentType } from '@/server/content-type';
import { validateTemplate, type ContentType as ValidateContentType } from '@/server/naming/engine';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

function readContentTypeFromUrl(url: string): ContentType | null {
  const u = new URL(url, 'http://x');
  const raw = u.searchParams.get('contentType');
  if (raw === null) return 'manga'; // default for back-compat
  if (isContentType(raw)) return raw;
  return null; // signal 400
}

// CONTENT_TYPE_BY_KEY maps NamingKey to the engine's template ContentType
const CONTENT_TYPE_BY_KEY: Record<NamingKey, ValidateContentType> = {
  series_folder: 'folder',
  volume_subfolder: 'folder',
  volume: 'volume',
  chapter: 'chapter',
  batch: 'batch',
};

export async function GET(req?: Request): Promise<Response> {
  const url = req?.url ?? 'http://x/api/settings/naming';
  const ct = readContentTypeFromUrl(url);
  if (ct === null) return NextResponse.json({ error: 'invalid contentType' }, { status: 400 });
  const templates = await getAllNamingTemplates(ct);
  return NextResponse.json({ contentType: ct, templates });
}

export async function PUT(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const ct = readContentTypeFromUrl(req.url);
  if (ct === null) return NextResponse.json({ error: 'invalid contentType' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = NamingPutBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  for (const key of NAMING_KEYS_BY_TYPE[ct]) {
    const tpl = parsed.data.templates[key];
    if (typeof tpl !== 'string') continue;
    // Empty volume_subfolder is allowed (flatten).
    if (key === 'volume_subfolder' && tpl === '') continue;
    const v = validateTemplate(tpl, CONTENT_TYPE_BY_KEY[key]);
    if (!v.ok) {
      return NextResponse.json(
        { error: `${key}: ${v.error}`, position: v.position },
        { status: 400 },
      );
    }
  }

  const before = await getAllNamingTemplates(ct);
  await setAllNamingTemplates(ct, parsed.data.templates);
  const after = await getAllNamingTemplates(ct);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'naming' },
    metadata: {
      contentType: ct,
      changedFields: shallowDiff(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>,
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
