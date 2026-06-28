import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { runUntilIdle } from '@/server/jobs/runner';
import { enqueueJob } from '@/server/db/jobs';
import { qbtWatchDescriptor } from '@/server/jobs/kinds/qbt-watch';
import { importDescriptor } from '@/server/jobs/kinds/import';
import { libraryScanDescriptor } from '@/server/jobs/kinds/library-scan';
import { housekeepingDescriptor } from '@/server/jobs/kinds/housekeeping';
import type { JobKindDescriptor } from '@/server/jobs/types';
import { JobRunBody, type RunnableJobKindEnum } from '@/server/openapi/schemas/jobs';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

type RunnableJobKind = z.infer<typeof RunnableJobKindEnum>;

// Admin-triggerable job kinds. `selfEnqueue: true` means we can enqueue a
// fresh empty-payload job before draining (useful for "do it now" kinds like
// `qbt_watch` that the scheduler runs on a 1-minute cron); `false` kinds are
// only meaningful when something else has already enqueued them (e.g.
// `import` is enqueued by `qbt_watch`). The `satisfies` clause keeps this
// record in compile-time lockstep with RunnableJobKindEnum in the OpenAPI
// schemas (the documented request-body enum).
const RUNNABLE = {
  qbt_watch: { descriptor: qbtWatchDescriptor as JobKindDescriptor<unknown, unknown>, selfEnqueue: true },
  import: { descriptor: importDescriptor as JobKindDescriptor<unknown, unknown>, selfEnqueue: false },
  library_scan: {
    descriptor: libraryScanDescriptor as JobKindDescriptor<unknown, unknown>,
    selfEnqueue: false,
  },
  housekeeping: {
    descriptor: housekeepingDescriptor as JobKindDescriptor<unknown, unknown>,
    selfEnqueue: true,
  },
} satisfies Record<
  RunnableJobKind,
  { descriptor: JobKindDescriptor<unknown, unknown>; selfEnqueue: boolean }
>;

/**
 * POST /api/jobs/run — admin-only.
 *
 * Drains all pending jobs of the given kind through the runner. For
 * self-enqueueable kinds (qbt_watch, housekeeping) enqueues a fresh job
 * first so this works as a "run it now" trigger even when the scheduler
 * hasn't fired yet.
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = JobRunBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }

  const entry = RUNNABLE[parsed.data.kind];
  if (entry.selfEnqueue) {
    await enqueueJob(entry.descriptor.kind, {});
  }
  const ran = await runUntilIdle(entry.descriptor);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'job.run',
    metadata: { kind: parsed.data.kind },
    context: auditContext(req),
  });
  return NextResponse.json({ ok: true, kind: parsed.data.kind, ran });
}
