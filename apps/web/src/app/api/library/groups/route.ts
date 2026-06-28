import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';
import {
  createGroup,
  groupCounts,
  listGroups,
} from '@/server/db/library-groups';
import { LibraryGroupCreateBody } from '@/server/openapi/schemas/library';
import type { LibraryGroupsResponse } from '@/server/openapi/schemas/library';

export const dynamic = 'force-dynamic';

/**
 * GET /api/library/groups — list every group with its display path and counts.
 *
 * `seriesCount` is RECURSIVE (members of subgroups count into the ancestor);
 * `subgroupCount` is direct children only. Not admin-gated — reads in the
 * library family go through the global session gate, like
 * `GET /api/scan/groups`.
 */
export async function GET(): Promise<NextResponse> {
  const groups = await listGroups();
  const counts = await groupCounts();
  const byId = new Map(groups.map((g) => [g.id, g]));
  // In-memory path assembly (same shape groupPath() produces) — one query for
  // the whole tree instead of a walk per row.
  const pathOf = (id: number): string => {
    const parts: string[] = [];
    let cursor: number | null = id;
    while (cursor !== null) {
      const g = byId.get(cursor);
      if (!g) break;
      parts.unshift(g.name);
      cursor = g.parentId;
    }
    return parts.join(' / ');
  };
  const body: z.infer<typeof LibraryGroupsResponse> = {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      parentId: g.parentId,
      path: pathOf(g.id),
      seriesCount: counts.get(g.id)?.seriesCount ?? 0,
      subgroupCount: counts.get(g.id)?.subgroupCount ?? 0,
    })),
  };
  return NextResponse.json(body);
}

/**
 * POST /api/library/groups — admin-only create.
 *
 * 201 with the full row (path + counts). 409 when a sibling with the same
 * name exists; 422 when `parentId` does not exist.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: z.infer<typeof LibraryGroupCreateBody>;
  try {
    body = LibraryGroupCreateBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.message : 'Invalid JSON body' },
      { status: 400 },
    );
  }

  let row;
  try {
    row = await createGroup(body.name, body.parentId ?? null);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/exists/.test(message)) return NextResponse.json({ error: message }, { status: 409 });
    if (/does not exist/.test(message)) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    throw e;
  }

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'library_group.create',
    target: { kind: 'library_group', id: String(row.id) },
    metadata: { name: row.name, parentId: row.parentId },
    context: auditContext(req),
  });

  const [allGroups, counts] = await Promise.all([listGroups(), groupCounts()]);
  const byId = new Map(allGroups.map((g) => [g.id, g]));
  const pathOf = (id: number): string => {
    const parts: string[] = [];
    let cursor: number | null = id;
    while (cursor !== null) {
      const g = byId.get(cursor);
      if (!g) break;
      parts.unshift(g.name);
      cursor = g.parentId;
    }
    return parts.join(' / ');
  };
  return NextResponse.json(
    {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      path: pathOf(row.id),
      seriesCount: counts.get(row.id)?.seriesCount ?? 0,
      subgroupCount: counts.get(row.id)?.subgroupCount ?? 0,
    },
    { status: 201 },
  );
}
