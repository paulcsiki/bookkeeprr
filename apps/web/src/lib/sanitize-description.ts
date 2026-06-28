/**
 * Clean a third-party book / manga description for display.
 *
 * Provider descriptions (Google Books, OpenLibrary, AniList, NovelUpdates)
 * arrive with a mix of HTML tags, HTML entities, markdown, leaked "download the
 * PDF here" links, and literal backslash line-escapes (markdown hard breaks).
 * This normalizes all of that to plain, readable text. Pure + unit-tested;
 * applied at the DB write so every stored description is clean regardless of
 * which integration produced it.
 */
export function sanitizeDescription(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw);

  // 1) HTML: <br> → newline, drop every other tag (AniList ships <i>/<b>/<br>).
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, '');

  // 2) Decode the handful of entities providers actually emit.
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

  // 3) Markdown links: drop ones pointing at a pirated download / source file,
  //    unwrap the rest to their link text.
  s = s.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_m, text: string, url: string) => {
    if (/pdf|epub|mobi|download|\/doc\//i.test(url) || /\bpdf\b|download/i.test(text)) return '';
    return text;
  });

  // 4) Strip bare URLs sitting alone on a line.
  s = s.replace(/^[ \t]*https?:\/\/\S+[ \t]*$/gim, '');

  // 5) Backslash line-escapes (markdown hard breaks): a "\" before a newline or
  //    at end of line is noise — remove it.
  s = s.replace(/\\(\r?\n)/g, '$1').replace(/\\+[ \t]*$/gm, '');

  // 6) Whitespace: trim each line, collapse runs of blank lines, trim overall.
  s = s
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return s.length > 0 ? s : null;
}
