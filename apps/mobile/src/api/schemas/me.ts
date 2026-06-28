import { z } from 'zod';

export const MeResponse = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  role: z.enum(['admin', 'user']),
  // Optional so a mobile app talking to an older server (or a test mock that
  // predates this field) still parses; the current server always sends it.
  avatarUrl: z.string().nullable().optional(),
});
export type MeResponse = z.infer<typeof MeResponse>;
