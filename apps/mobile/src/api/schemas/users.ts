import { z } from 'zod';
import { USER_SOURCES } from '@bookkeeprr/types';

// The server serializes raw user rows (minus passwordHash): the auth source is
// `authSource`, timestamps are ISO strings (or epoch ms), and it adds avatarUrl.
// Map authSource→source at parse time and keep timestamp/extra fields lenient so
// the screen renders rather than throwing on a shape it didn't expect.
export const UserRow = z.preprocess(
  (u) =>
    u && typeof u === 'object' && 'authSource' in u && !('source' in u)
      ? { ...(u as Record<string, unknown>), source: (u as { authSource: unknown }).authSource }
      : u,
  z.object({
    id: z.number().int().positive(),
    username: z.string(),
    displayName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    role: z.enum(['admin', 'user']),
    source: z.enum(USER_SOURCES),
    disabled: z.boolean(),
    avatarUrl: z.string().nullable().optional(),
    createdAt: z.union([z.string(), z.number()]).nullable().optional(),
    lastLoginAt: z.union([z.string(), z.number()]).nullable().optional(),
  }),
);
export type UserRow = z.infer<typeof UserRow>;

// Server returns `{ users: [...] }`.
export const UsersResponse = z.object({
  users: z.array(UserRow),
});
export type UsersResponse = z.infer<typeof UsersResponse>;
