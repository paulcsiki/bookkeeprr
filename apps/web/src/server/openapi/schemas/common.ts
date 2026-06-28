import { z } from 'zod';

/** The shared error envelope (docs/api.md → "Error envelope"). */
export const ErrorResponse = z.object({
  error: z.string(),
  detail: z.string().optional(),
  hint: z.string().optional(),
});

/** Admin-gate error envelope emitted by requireAdmin (401/403 paths across
 *  all admin-only families). Distinct from ErrorResponse's `{ error }` shape. */
export const MessageResponse = z.object({ message: z.string() });
