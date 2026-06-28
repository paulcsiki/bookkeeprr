/**
 * Safety check for the `return_to` parameter accepted by the login flow
 * during mobile onboarding. The only acceptable scheme is `bookkeeprr://`
 * — anything else (https://, javascript:, intent://, …) would let the
 * existing /login endpoint be abused as an open redirect / phish vector.
 *
 * Returns the original string when it passes, or `null` otherwise. Callers
 * should translate `null` into HTTP 400 with body
 * `{ error: 'invalid return_to scheme' }`.
 */
export function validateReturnTo(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > 2048) return null;
  if (!value.startsWith('bookkeeprr://')) return null;
  return value;
}

/**
 * Append `?exchange=<code>` (or `&exchange=<code>`) to a previously-validated
 * `return_to` URL. Does NOT re-validate the scheme — callers must have run
 * the input through `validateReturnTo` first.
 */
export function appendExchangeCode(returnTo: string, code: string): string {
  const separator = returnTo.includes('?') ? '&' : '?';
  return `${returnTo}${separator}exchange=${encodeURIComponent(code)}`;
}
