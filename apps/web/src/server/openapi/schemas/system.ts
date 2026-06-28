import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// System family — health probe + first-run wizard endpoints. All of these are
// reachable WITHOUT credentials (the proxy exempts /api/health and
// /api/first-run/* permanently — see src/proxy.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/health body — the SAME shape on 200 (healthy) and 503
 *  (unhealthy: no worker heartbeat yet, or heartbeat older than 3 minutes). */
export const HealthResponse = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  worker: z.object({
    heartbeatAgeMs: z
      .number()
      .int()
      .nullable()
      .describe('Milliseconds since the worker heartbeat; null when none was ever recorded.'),
  }),
  timestamp: z.number().int().describe('Epoch milliseconds.'),
});

/** GET /api/first-run/status 200. */
export const FirstRunStatusResponse = z.object({
  complete: z.boolean().describe('True once the first-run wizard has been completed.'),
});

/** POST /api/first-run/complete 200. */
export const FirstRunCompleteResponse = z.object({ ok: z.literal(true) });
