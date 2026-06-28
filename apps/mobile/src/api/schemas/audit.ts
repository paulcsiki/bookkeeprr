import { z } from 'zod';

export const AuditVerb = z.enum(['create', 'update', 'delete', 'login']);
export type AuditVerb = z.infer<typeof AuditVerb>;

export const AuditActor = z.object({
  userId: z.number().int().positive(),
  username: z.string(),
  role: z.enum(['admin', 'user']),
});

export const AuditEvent = z.object({
  id: z.number().int().positive(),
  occurredAt: z.string(),
  actor: AuditActor.nullable(),
  verb: AuditVerb,
  action: z.string(),
  target: z.string(),
  diff: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const AuditEventsResponse = z.object({
  rows: z.array(AuditEvent),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().optional(),
});
export type AuditEventsResponse = z.infer<typeof AuditEventsResponse>;
