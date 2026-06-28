import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { queryAuditEvents, type AuditEventRow } from '@/server/db/audit';
import { listUsers } from '@/server/db/users';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/audit/events — the audit log for the mobile Settings → Audit
 * screen.
 *
 * The web `/api/audit/events` endpoint returns raw `AuditEventRow`s (snake-ish
 * column names, `metadataJson`, no derived verb/role). The mobile
 * `AuditEventsResponse` schema expects a flattened, presentation-ready shape:
 * `{ rows: [{ id, occurredAt, actor: { userId, username, role } | null, verb,
 * action, target, diff }], total }`. Rather than changing the web endpoint's
 * shape (the web audit table depends on it), this mobile endpoint does the
 * mapping. Gated by `requireAdmin` (cookie OR bearer token).
 */

const FilterEnum = z.enum(['all', 'writes', 'logins', 'errors']);

const QuerySchema = z.object({
  filter: FilterEnum.default('all'),
  cursor: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

type Verb = 'create' | 'update' | 'delete' | 'login';

/** Derives the mobile-facing verb badge from the dotted action string. */
function deriveVerb(action: string): Verb {
  const lower = action.toLowerCase();
  if (lower.includes('login') || lower.includes('logout')) return 'login';
  if (lower.endsWith('.create') || lower.includes('create')) return 'create';
  if (
    lower.endsWith('.delete') ||
    lower.includes('delete') ||
    lower.includes('revoke') ||
    lower.includes('disable')
  ) {
    return 'delete';
  }
  return 'update';
}

/** A single-line, human-readable diff/summary derived from the metadata JSON. */
function deriveDiff(metadataJson: string | null): string {
  if (metadataJson === null || metadataJson.length === 0) return '';
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const changed = obj.changedFields;
      if (Array.isArray(changed)) return changed.map((c) => String(c)).join(', ');
      const entries = Object.entries(obj).filter(([, v]) => v != null);
      if (entries.length === 0) return '';
      return entries.map(([k, v]) => `${k}: ${formatValue(v)}`).join(' · ');
    }
    return JSON.stringify(parsed);
  } catch {
    return metadataJson;
  }
}

function formatValue(v: unknown): string {
  return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
}

function deriveTarget(row: AuditEventRow): string {
  if (row.targetKind === null && row.targetId === null) return '—';
  if (row.targetId === null) return row.targetKind ?? '—';
  if (row.targetKind === null) return row.targetId;
  return `${row.targetKind}:${row.targetId}`;
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid query parameters' }, { status: 400 });
  }
  const { filter, cursor, limit } = parsed.data;
  const offset = cursor ?? 0;

  // Map the mobile filter onto the audit query. `logins` and `errors` scope by
  // action; `writes` and `all` are unfiltered server-side and reduced below.
  const queryFilter =
    filter === 'logins' ? { actionPrefix: 'auth.' } : {};

  const { rows, total } = await queryAuditEvents(queryFilter, { limit: limit + 1, offset });

  // Resolve actor roles in one pass.
  const users = await listUsers();
  const roleById = new Map(users.map((u) => [u.id, u.role]));

  let mapped = rows.map((row) => {
    const verb = deriveVerb(row.action);
    const actor =
      row.actorUserId !== null
        ? {
            userId: row.actorUserId,
            username: row.actorUsername ?? `user#${row.actorUserId}`,
            role: roleById.get(row.actorUserId) ?? ('user' as const),
          }
        : null;
    return {
      id: row.id,
      occurredAt: row.timestamp.toISOString(),
      actor,
      verb,
      action: row.action,
      target: deriveTarget(row),
      diff: deriveDiff(row.metadataJson),
    };
  });

  // Refine filters that depend on the derived verb.
  if (filter === 'writes') {
    mapped = mapped.filter((e) => e.verb === 'create' || e.verb === 'update' || e.verb === 'delete');
  } else if (filter === 'errors') {
    mapped = mapped.filter((e) => e.action.toLowerCase().includes('failure'));
  }

  const hasMore = mapped.length > limit;
  const page = hasMore ? mapped.slice(0, limit) : mapped;
  const nextCursor = hasMore ? String(offset + limit) : undefined;

  return NextResponse.json({
    rows: page,
    total,
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  });
}
