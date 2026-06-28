import type { z } from 'zod';

/**
 * Assert a handler Response matches its documented response schema.
 * Clones so the caller can still read the body. Returns the parsed value.
 * Pass `hint` (e.g. 'GET /api/series/{id}') so a shape mismatch in CI names
 * the endpoint instead of dumping a bare ZodError.
 */
export async function expectShape<T extends z.ZodType>(
  schema: T,
  res: Response,
  hint?: string,
): Promise<z.infer<T>> {
  const body = await res.clone().json();
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(`${hint ? `${hint}: ` : ''}response shape mismatch\n${result.error.message}`);
  }
  return result.data;
}
