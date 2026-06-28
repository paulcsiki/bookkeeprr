/**
 * Deterministic avatar colour variant (1-5) for a seed string (email/username).
 * Same seed always returns the same variant, giving each user a stable colour.
 *
 * This is a pure function with no React/DOM dependency, so it lives OUTSIDE the
 * `'use client'` Avatar module — server components (the dashboard feed,
 * leaderboard, and profile sections) compute the variant during SSR and pass it
 * to the client `<Avatar variant={...} />`. Importing it from a client module
 * would throw "Attempted to call colorFromSeed() from the server".
 */
export function colorFromSeed(seed: string): 1 | 2 | 3 | 4 | 5 {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return ((Math.abs(h) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}
