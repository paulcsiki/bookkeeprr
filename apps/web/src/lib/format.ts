/**
 * Normalise a metadata description for plain-text display. Sources like AniList
 * embed light HTML (`<br>`, `<i>`, `<b>`) and entities even when asked for
 * non-HTML text, which otherwise render literally. Converts `<br>` and paragraph
 * breaks to newlines, strips remaining tags, decodes common entities, and
 * collapses runs of blank lines. Pair with a `whitespace-pre-line` container so
 * the newlines render as breaks.
 */
/**
 * Format a runtime given in whole minutes as a compact hours+minutes string for
 * display (e.g. audiobook runtime). Examples: 750 → "12h 30m", 60 → "1h",
 * 45 → "45m", 0 → "0m". Null/undefined/negative render as an em dash so callers
 * can pass a possibly-null DB column straight through.
 */
export function fmtRuntime(min: number | null | undefined): string {
  if (min == null || min < 0) return '—';
  const hours = Math.floor(min / 60);
  const mins = min % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format a byte count for compact display (e.g. on-disk series size). Returns an
 * em dash for null/zero so a possibly-empty aggregate can be passed straight in.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(0)} KiB`;
}

export function cleanDescription(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
