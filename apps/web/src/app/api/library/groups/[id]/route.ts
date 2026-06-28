import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';
import {
  deleteGroupRecursive,
  getGroup,
  groupCounts,
  groupPath,
  renameGroup,
  reparentGroup,
} from '@/server/db/library-groups';
import { LibraryGroupPatchBody } from '@/server/openapi/schemas/library';

export const dynamic = 'force-dynamic';

/** DAL error message → HTTP status: sibling conflicts are 409, everything the
 *  caller could not have known to be valid (cycles, unknown ids) is 422. */
function dalErrorResponse(e: unknown): NextResponse {
  if (!(e instanceof Error)) throw e;
  if (/exists/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 409 });
  if (/cycle|does not exist/.test(e.message)) {
    return NextResponse.json({ error: e.message }, { status: 422 });
  }
  throw e;
}

/**
 * PATCH /api/library/groups/{id} — admin-only rename and/or reparent.
 *
 * 200 with the updated row (path + counts). 409 sibling-name conflict;
 * 422 when the reparent would create a cycle or the group/parent is unknown.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: z.infer<typeof LibraryGroupPatchBody>;
  try {
    body = LibraryGroupPatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.message : 'Invalid JSON body' },
      { status: 400 },
    );
  }

  try {
    // Reparent before rename: the cycle/parent checks run against the stable
    // tree, and the rename's sibling check then applies in the NEW location.
    if (body.parentId !== undefined) await reparentGroup(id, body.parentId);
    if (body.name !== undefined) await renameGroup(id, body.name);
  } catch (e) {
    return dalErrorResponse(e);
  }

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'library_group.update',
    target: { kind: 'library_group', id: String(id) },
    metadata: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.parentId !== undefined && { parentId: body.parentId }),
    },
    context: auditContext(req),
  });

  const updated = (await getGroup(id))!;
  const counts = await groupCounts();
  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    parentId: updated.parentId,
    path: (await groupPath(updated.id)).join(' / '),
    seriesCount: counts.get(updated.id)?.seriesCount ?? 0,
    subgroupCount: counts.get(updated.id)?.subgroupCount ?? 0,
  });
}

/**
 * DELETE /api/library/groups/{id} — admin-only RECURSIVE cascade.
 *
 * Deletes the group, every subgroup beneath it, AND every member series
 * record (each through the regular series-delete path, so volumes / files /
 * downloads cascade). Disk files are untouched. 200 with the counts; 422 on
 * an unknown id.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let result: { deletedGroups: number; deletedSeries: number };
  try {
    result = await deleteGroupRecursive(id);
  } catch (e) {
    return dalErrorResponse(e);
  }

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'library_group.delete',
    target: { kind: 'library_group', id: String(id) },
    metadata: result,
    context: auditContext(req),
  });

  return NextResponse.json(result);
}
