/**
 * Parse a raw string input as an integer and validate it falls within [min, max].
 *
 * Returns `{ ok: true, value }` on success or `{ ok: false, error }` with a
 * human-readable message on any failure.
 */
export function parseIntInRange(
  raw: string,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return { ok: false, error: 'Value is required' };
  }

  // Must be a valid integer (optional leading minus + digits only, no decimals).
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: 'Must be a whole number' };
  }

  const value = Number(trimmed);

  if (value < min) {
    return { ok: false, error: `Must be at least ${min}` };
  }

  if (value > max) {
    return { ok: false, error: `Must be at most ${max}` };
  }

  return { ok: true, value };
}
