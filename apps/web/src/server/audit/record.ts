import { insertAuditEvent } from '@/server/db/audit';
import { logger } from '@/server/logger';

export type AuditActor =
  | { kind: 'user'; userId: number; username: string }
  | { kind: 'system' }
  | { kind: 'anonymous' };

export type AuditRequestContext = {
  peerIp: string | null;
  clientIp: string | null;
  userAgent: string | null;
};

export type RecordAuditEventInput = {
  actor: AuditActor;
  action: string;
  target?: { kind: string; id: string };
  metadata?: Record<string, unknown>;
  context?: AuditRequestContext;
};

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  try {
    await insertAuditEvent({
      actorKind: input.actor.kind,
      actorUserId: input.actor.kind === 'user' ? input.actor.userId : null,
      actorUsername: input.actor.kind === 'user' ? input.actor.username : null,
      action: input.action,
      targetKind: input.target?.kind ?? null,
      targetId: input.target?.id ?? null,
      metadata: input.metadata ?? null,
      peerIp: input.context?.peerIp ?? null,
      clientIp: input.context?.clientIp ?? null,
      userAgent: input.context?.userAgent ?? null,
    });
  } catch (err) {
    logger()
      .child({ component: 'audit' })
      .error({ err, action: input.action }, 'audit write failed');
  }
}
