import { load, type CheerioAPI } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import type { NuSearchHit, NuSeriesDetail, NuChapterEntry } from './schemas';

const SLUG_FROM_URL_RE = /\/series\/([a-z0-9-]+)\/?/;

export function parseSearchHits(html: string): NuSearchHit[] {
  const $ = load(html);
  const hits: NuSearchHit[] = [];
  $('.search_main_box_nu').each((_, el) => {
    const $el = $(el);
    const $titleA = $el.find('.search_title a').first();
    const href = $titleA.attr('href') ?? '';
    const m = href.match(SLUG_FROM_URL_RE);
    if (!m) return;
    const slug = m[1]!;
    const title = $titleA.text().trim();
    if (title.length === 0) return;
    const rawCover = $el.find('.search_img_nu img').attr('src') ?? null;
    // NovelUpdates serves a "no image" placeholder for series without art —
    // treat that as no cover so the UI shows the clean tinted fallback (and the
    // cover-enrichment step can try another source) instead of the placeholder.
    const coverUrl = rawCover && /noimage|nocover/i.test(rawCover) ? null : rawCover;
    // The series-finder markup has no publication year (only a "Last Updated"
    // date, which is not a year); year is therefore always null.
    hits.push({ slug, title, coverUrl, year: null });
  });
  return hits;
}

function pickListedNames($: CheerioAPI, selector: string): string[] {
  const out: string[] = [];
  $(selector).each((_, el) => {
    const txt = $(el).text().trim();
    if (txt.length > 0) out.push(txt);
  });
  return out;
}

function pickFirstNonEmpty($: CheerioAPI, selector: string): string | null {
  const txt = $(selector).first().text().trim();
  return txt.length > 0 ? txt : null;
}

const VOLUMES_RE = /(\d+)\s*Volumes?/i;

export function parseSeriesPage(html: string, slug: string): NuSeriesDetail {
  const $ = load(html);
  const title = pickFirstNonEmpty($, '.seriestitlenu') ?? slug;
  const aliases = ($('#editassociated').html() ?? '')
    .split(/<br\s*\/?>/i)
    .map((t) => load(t).text().trim())
    .filter((t) => t.length > 0);
  const coverUrl = $('.seriesimg img').attr('src') ?? null;
  const description = pickFirstNonEmpty($, '#editdescription');
  const author = pickListedNames($, '#showauthors a').join(', ') || null;
  const illustrator = pickListedNames($, '#showartists a').join(', ') || null;
  const originalLanguage = pickFirstNonEmpty($, '#showlang');
  const statusInCoo = pickFirstNonEmpty($, '#editstatus');
  const totalVolumes = (() => {
    if (statusInCoo === null) return null;
    const m = statusInCoo.match(VOLUMES_RE);
    return m ? Number(m[1]) : null;
  })();
  const numericId = (() => {
    const v = $('input#mypostid').attr('value');
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  return {
    slug,
    numericId,
    title,
    aliases,
    coverUrl,
    description,
    author,
    illustrator,
    originalLanguage,
    totalVolumes,
    statusInCoo,
  };
}

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
});

type RssShape = {
  rss?: {
    channel?: {
      item?:
        | Array<{ title: string; link: string; pubDate: string }>
        | { title: string; link: string; pubDate: string };
    };
  };
};

export function parseRssItems(xml: string): NuChapterEntry[] {
  let parsed: RssShape;
  try {
    parsed = XML_PARSER.parse(xml) as RssShape;
  } catch {
    return [];
  }
  const rawItem = parsed.rss?.channel?.item;
  if (rawItem === undefined) return [];
  const items = Array.isArray(rawItem) ? rawItem : [rawItem];
  const out: NuChapterEntry[] = [];
  for (const it of items) {
    if (
      typeof it.title !== 'string' ||
      typeof it.link !== 'string' ||
      typeof it.pubDate !== 'string'
    ) {
      continue;
    }
    const date = new Date(it.pubDate);
    if (isNaN(date.getTime())) continue;
    out.push({ title: it.title.trim(), link: it.link.trim(), pubDate: date });
  }
  return out;
}
