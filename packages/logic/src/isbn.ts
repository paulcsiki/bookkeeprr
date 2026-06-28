/**
 * Build an Open Library cover image URL for a given ISBN.
 *
 * `size`: 'S' (small, ~120px wide), 'M' (medium, ~180px), 'L' (large, ~480px).
 *
 * Open Library returns a 1x1 transparent pixel when no cover is found,
 * UNLESS `default=false` is appended — then it returns 404. Consumers
 * usually want the 404 so their `onError` handler fires and they can
 * gracefully degrade to a placeholder.
 */
export function openLibraryCoverUrl(
  isbn: string,
  size: 'S' | 'M' | 'L' = 'M',
  options: { default?: boolean } = {},
): string {
  const def = options.default === false ? '?default=false' : '';
  return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg${def}`;
}
