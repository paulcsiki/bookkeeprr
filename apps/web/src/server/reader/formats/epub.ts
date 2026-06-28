import { stat } from 'node:fs/promises';
import { listEntries, readEntry } from './zip';

/**
 * EPUB adapter built on the pure-Node zip reader.
 *
 * An EPUB is an OCF (zip) container. We parse the minimal subset needed for a
 * reader: the OPF package (manifest + spine reading order) and a table of
 * contents (EPUB3 nav document, falling back to an EPUB2 NCX).
 *
 * XML is parsed with deliberately small string/regex matching — no DOMParser,
 * no XML library, no new dependencies. The regexes tolerate arbitrary attribute
 * order and single- or double-quoted values.
 */

export type EpubSpineItem = { idx: number; href: string; id?: string; mediaType?: string };
export type EpubTocEntry = { label: string; href: string; spineIdx?: number };
export type EpubManifest = { opfDir: string; spine: EpubSpineItem[]; toc: EpubTocEntry[] };

interface ManifestItem {
  href: string;
  mediaType?: string;
  properties?: string;
}

/**
 * Block matcher for an OPF element that may carry an XML namespace prefix —
 * e.g. both `<spine>…</spine>` and `<opf:spine>…</opf:spine>` are valid. Returns
 * a regex whose first capture group is the element's inner content.
 */
function NS_RE(name: string): RegExp {
  return new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${name}>`,
    'i',
  );
}

/** Extract an attribute value (single or double quoted) from a tag string. */
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!m) return undefined;
  return m[2] !== undefined ? m[2] : m[3];
}

/** Directory portion of a zip entry path ('' when at the root). */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Join opfDir + relative href into a zip entry name, normalizing `./` and `../`. */
function joinEntry(opfDir: string, href: string): string {
  const raw = opfDir ? `${opfDir}/${href}` : href;
  const parts: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** Strip a `#fragment` from an href. */
function stripFragment(href: string): string {
  const i = href.indexOf('#');
  return i === -1 ? href : href.slice(0, i);
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

export async function parseEpub(path: string): Promise<EpubManifest> {
  // 1. Locate the OPF via the OCF container.
  const containerXml = (await readEntry(path, 'META-INF/container.xml')).toString('utf8');
  const rootfileTag = containerXml.match(/<rootfile\b[^>]*>/i)?.[0];
  const opfPath = rootfileTag && attr(rootfileTag, 'full-path');
  if (!opfPath) throw new Error('epub: no rootfile full-path in container.xml');
  const opfDir = dirOf(opfPath);

  // 2. Parse the OPF package: manifest items + spine reading order.
  const opfXml = (await readEntry(path, opfPath)).toString('utf8');

  const manifest = new Map<string, ManifestItem>();
  const manifestBlock = opfXml.match(NS_RE('manifest'))?.[1] ?? '';
  for (const m of manifestBlock.matchAll(/<(?:[A-Za-z_][\w.-]*:)?item\b[^>]*\/?>/gi)) {
    const tag = m[0];
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (!id || !href) continue;
    manifest.set(id, { href, mediaType: attr(tag, 'media-type'), properties: attr(tag, 'properties') });
  }

  const spine: EpubSpineItem[] = [];
  const spineBlock = opfXml.match(NS_RE('spine'))?.[1] ?? '';
  for (const m of spineBlock.matchAll(/<(?:[A-Za-z_][\w.-]*:)?itemref\b[^>]*\/?>/gi)) {
    const idref = attr(m[0], 'idref');
    if (!idref) continue;
    const item = manifest.get(idref);
    if (!item) continue;
    spine.push({ idx: spine.length, href: item.href, id: idref, mediaType: item.mediaType });
  }

  // 3. TOC — prefer EPUB3 nav, fall back to EPUB2 NCX.
  const toc = await parseToc(path, opfDir, opfXml, manifest, spine);

  return { opfDir, spine, toc };
}

async function parseToc(
  path: string,
  opfDir: string,
  opfXml: string,
  manifest: Map<string, ManifestItem>,
  spine: EpubSpineItem[],
): Promise<EpubTocEntry[]> {
  // EPUB3 nav: manifest item with `properties` containing the `nav` token.
  const navItem = [...manifest.values()].find((it) =>
    (it.properties ?? '').split(/\s+/).includes('nav'),
  );
  if (navItem) {
    const navXml = (await readEntry(path, joinEntry(opfDir, navItem.href))).toString('utf8');
    const navDir = dirOf(joinEntry(opfDir, navItem.href));
    // Prefer the <nav epub:type="toc">; otherwise the first <nav>.
    const navBlock =
      navXml.match(/<nav\b[^>]*epub:type\s*=\s*["']toc["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] ??
      navXml.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)?.[1];
    if (navBlock) {
      const entries: EpubTocEntry[] = [];
      for (const a of navBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = attr(a[0]!, 'href');
        if (!href) continue;
        const label = decodeXmlText(a[1]!.replace(/<[^>]*>/g, ''));
        // nav hrefs are relative to the nav document's directory.
        const entryName = joinEntry(navDir, stripFragment(href));
        const spineIdx = spine.findIndex((s) => joinEntry(opfDir, s.href) === entryName);
        entries.push({ label, href, spineIdx: spineIdx === -1 ? undefined : spineIdx });
      }
      return entries;
    }
  }

  // EPUB2 NCX fallback.
  const ncxItem = [...manifest.values()].find(
    (it) => it.mediaType === 'application/x-dtbncx+xml',
  );
  if (ncxItem) {
    const ncxXml = (await readEntry(path, joinEntry(opfDir, ncxItem.href))).toString('utf8');
    const ncxDir = dirOf(joinEntry(opfDir, ncxItem.href));
    const entries: EpubTocEntry[] = [];
    for (const np of ncxXml.matchAll(/<navPoint\b[^>]*>([\s\S]*?)<\/navPoint>/gi)) {
      const inner = np[1]!;
      const label = decodeXmlText(
        (inner.match(/<navLabel\b[^>]*>[\s\S]*?<text\b[^>]*>([\s\S]*?)<\/text>/i)?.[1] ?? '').replace(
          /<[^>]*>/g,
          '',
        ),
      );
      const src = attr(inner.match(/<content\b[^>]*\/?>/i)?.[0] ?? '', 'src');
      if (!src) continue;
      const entryName = joinEntry(ncxDir, stripFragment(src));
      const spineIdx = spine.findIndex((s) => joinEntry(opfDir, s.href) === entryName);
      entries.push({ label, href: src, spineIdx: spineIdx === -1 ? undefined : spineIdx });
    }
    return entries;
  }

  return [];
}

const CONTENT_TYPES: Record<string, string> = {
  xhtml: 'application/xhtml+xml',
  xht: 'application/xhtml+xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  otf: 'font/otf',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  js: 'text/javascript',
};

function contentTypeFor(entryName: string): string {
  const ext = entryName.slice(entryName.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

// Bounded LRU cache of entry-name sets, keyed by `path|mtimeMs|size` so a
// replaced file is never served from a stale set. Eviction is oldest-first.
const ENTRY_CACHE_MAX = 64;
const entryListCache = new Map<string, Promise<Set<string>>>();

async function entrySet(path: string): Promise<Set<string>> {
  const st = await stat(path);
  const key = `${path}|${st.mtimeMs}|${st.size}`;
  const cached = entryListCache.get(key);
  if (cached) {
    // Refresh LRU recency.
    entryListCache.delete(key);
    entryListCache.set(key, cached);
    return cached;
  }
  const promise = listEntries(path).then((names) => new Set(names));
  entryListCache.set(key, promise);
  if (entryListCache.size > ENTRY_CACHE_MAX) {
    const oldest = entryListCache.keys().next().value;
    if (oldest !== undefined) entryListCache.delete(oldest);
  }
  return promise;
}

export async function readEpubResource(
  path: string,
  entryName: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  // Only literal, existing entries are served. A traversal string like
  // `OEBPS/../secret` is not a literal entry name, so it is rejected here too.
  const entries = await entrySet(path);
  if (!entries.has(entryName)) {
    throw new Error('epub entry not found: ' + entryName);
  }
  const buffer = await readEntry(path, entryName);
  return { buffer, contentType: contentTypeFor(entryName) };
}
