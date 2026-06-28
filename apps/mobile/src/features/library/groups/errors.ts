import { ApiError } from '@/api/client';

/**
 * Extract the server's {error|message} text from a thrown ApiError so 409s
 * ("A group with that name already exists here.") surface inline verbatim.
 */
export function groupErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: string; message?: string } | null;
    const msg = body?.error ?? body?.message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return fallback;
}
