import { and, desc, eq, gte, like, lt, lte, sql } from 'drizzle-orm';
import { getDb } from './client';
import { auditEvents, type AuditEventRow } from './schema';
import { withWriteLock } from './write-lock';

export type { AuditEventRow };

export type InsertAuditEventInput = {
  timestamp?: Date;
  actorKind: 'user' | 'system' | 'anonymous';
  actorUserId: number | null;
  actorUsername: string | null;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  peerIp: string | null;
  clientIp: string | null;
  userAgent: string | null;
};

export async function insertAuditEvent(input: InsertAuditEventInput): Promise<AuditEventRow> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(auditEvents)
      .values({
        ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
        actorKind: input.actorKind,
        actorUserId: input.actorUserId,
        actorUsername: input.actorUsername,
        action: input.action,
        targetKind: input.targetKind,
        targetId: input.targetId,
        metadataJson: input.metadata === null ? null : JSON.stringify(input.metadata),
        peerIp: input.peerIp,
        clientIp: input.clientIp,
        userAgent: input.userAgent,
      })
      .returning();
    if (!row) throw new Error('insertAuditEvent: insert returned no row');
    return row;
  });
}

export type AuditEventFilter = {
  actorUserId?: number | null;
  action?: string;
  actionPrefix?: string;
  from?: Date;
  to?: Date;
};

export async function queryAuditEvents(
  filter: AuditEventFilter,
  opts: { limit: number; offset: number },
): Promise<{ rows: AuditEventRow[]; total: number }> {
  const conditions = [];
  if (filter.actorUserId !== undefined && filter.actorUserId !== null) {
    conditions.push(eq(auditEvents.actorUserId, filter.actorUserId));
  }
  if (filter.action !== undefined) {
    conditions.push(eq(auditEvents.action, filter.action));
  }
  if (filter.actionPrefix !== undefined) {
    conditions.push(like(auditEvents.action, `${filter.actionPrefix}%`));
  }
  if (filter.from !== undefined) {
    conditions.push(gte(auditEvents.timestamp, filter.from));
  }
  if (filter.to !== undefined) {
    conditions.push(lte(auditEvents.timestamp, filter.to));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await getDb()
    .select()
    .from(auditEvents)
    .where(whereClause)
    .orderBy(desc(auditEvents.timestamp), desc(auditEvents.id))
    .limit(opts.limit)
    .offset(opts.offset);

  const [countRow] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(auditEvents)
    .where(whereClause);

  return { rows, total: Number(countRow?.count ?? 0) };
}

export async function pruneAuditEvents(olderThan: Date): Promise<number> {
  return withWriteLock(async () => {
    const [before] = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(auditEvents)
      .where(lt(auditEvents.timestamp, olderThan));
    const count = Number(before?.count ?? 0);
    await getDb().delete(auditEvents).where(lt(auditEvents.timestamp, olderThan));
    return count;
  });
}
