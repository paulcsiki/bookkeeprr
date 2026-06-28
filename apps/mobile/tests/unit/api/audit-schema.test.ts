import { AuditEvent, AuditVerb, AuditEventsResponse } from '@/api/schemas';

it('parses each verb', () => {
  for (const verb of ['create', 'update', 'delete', 'login']) {
    expect(AuditVerb.parse(verb)).toBe(verb);
  }
});

it('parses a full event', () => {
  const e = AuditEvent.parse({
    id: 1,
    occurredAt: '2026-05-26T17:42:00Z',
    actor: { userId: 1, username: 'paul', role: 'admin' },
    verb: 'create',
    action: 'added series',
    target: 'series:vinland-saga',
    diff: '+ monitored',
  });
  expect(e.actor!.role).toBe('admin');
});

it('parses an event with null actor (unauthenticated event)', () => {
  const e = AuditEvent.parse({
    id: 9,
    occurredAt: '2026-05-25T22:15:00Z',
    actor: null,
    verb: 'login',
    action: 'failed sign-in',
    target: 'user:admin · 203.0.113.4',
    diff: 'rate-limited',
  });
  expect(e.actor).toBeNull();
});

it('parses a paginated response', () => {
  const r = AuditEventsResponse.parse({ rows: [], total: 142, nextCursor: 'abc' });
  expect(r.total).toBe(142);
});

it('cursor is optional', () => {
  const r = AuditEventsResponse.parse({ rows: [], total: 0 });
  expect(r.nextCursor).toBeUndefined();
});
