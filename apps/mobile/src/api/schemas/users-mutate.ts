import { z } from 'zod';

export const CreateUserBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8),
  role: z.enum(['admin', 'user']),
  mustChangePassword: z.boolean(),
});
export type CreateUserBody = z.infer<typeof CreateUserBody>;

// The POST /api/users response carries the full user; we only need id/username/role.
export const CreateUserResponse = z.object({
  user: z.object({
    id: z.number().int().positive(),
    username: z.string(),
    role: z.enum(['admin', 'user']),
  }),
});
export type CreateUserResponse = z.infer<typeof CreateUserResponse>;

/** Local mirror of the server password policy (min 8). Hashing stays server-side. */
export function validatePassword(plain: string): string | null {
  if (plain.length < 8) return 'Password must be at least 8 characters';
  return null;
}
