import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseSearchHits,
  parseSeriesPage,
  parseRssItems,
} from '@/server/integrations/novelupdates/parser';

const FIXTURE_DIR = join(__dirname, '../../../../src/server/integrations/novelupdates/fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8');
}

describe('parseSearchHits', () => {
  it('extracts hits from search-success fixture (series-finder markup)', () => {
    const hits = parseSearchHits(loadFixture('search-success.html'));
    // Two valid series rows; the third row (no /series/ href) is skipped.
    expect(hits.length).toBe(2);
    expect(hits[0]).toEqual({
      slug: 'solo-leveling',
      title: 'Solo Leveling',
      coverUrl: 'https://cdn.novelupdates.com/imgmid/series_20290.jpg',
      year: null,
    });
    expect(hits[1]!.slug).toBe('era-of-supreme-martial-arts-leveling-up-alone-in-the-abyss');
    // The new markup carries no publication year.
    expect(hits[1]!.year).toBeNull();
  });

  it('returns [] for empty-search fixture', () => {
    const hits = parseSearchHits(loadFixture('empty-search.html'));
    expect(hits).toEqual([]);
  });

  it('treats a NovelUpdates "no image" placeholder as no cover', () => {
    const html = `
      <div class="search_main_box_nu">
        <div class="search_img_nu"><img src="https://cdn.novelupdates.com/img/noimagefound.jpg" /></div>
        <div class="search_title"><a href="/series/obscure-ln/">Obscure LN</a></div>
      </div>`;
    const hits = parseSearchHits(html);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.coverUrl).toBeNull();
  });

  it('returns [] for empty input', () => {
    expect(parseSearchHits('')).toEqual([]);
  });

  it('skips entries with missing/invalid slugs', () => {
    const malformed = `
      <div class="search_main_box_nu">
        <div class="search_body_nu">
          <div class="search_title"><a href="https://www.novelupdates.com/genre/fantasy/">Bad</a></div>
        </div>
      </div>
    `;
    expect(parseSearchHits(malformed)).toEqual([]);
  });
});

describe('parseSeriesPage', () => {
  it('extracts full metadata from series-detail fixture', () => {
    const detail = parseSeriesPage(loadFixture('series-detail.html'), 'mushoku-tensei');
    expect(detail.slug).toBe('mushoku-tensei');
    expect(detail.numericId).toBe(2000);
    expect(detail.title).toBe('Mushoku Tensei');
    expect(detail.aliases).toContain('無職転生');
    expect(detail.aliases).toContain('Wuzhi Zhuansheng');
    expect(detail.author).toBe('Rifujin na Magonote');
    expect(detail.illustrator).toBe('Shirotaka');
    expect(detail.originalLanguage).toBe('Japanese');
    expect(detail.statusInCoo).toBe('26 Volumes (Completed)');
    expect(detail.totalVolumes).toBe(26);
  });

  it('returns nulls for missing fields without crashing', () => {
    const detail = parseSeriesPage('<html><body></body></html>', 'whatever');
    expect(detail.slug).toBe('whatever');
    expect(detail.numericId).toBeNull();
    expect(detail.aliases).toEqual([]);
    expect(detail.author).toBeNull();
    expect(detail.totalVolumes).toBeNull();
  });
});

describe('parseRssItems', () => {
  it('extracts items from rss-feed fixture', () => {
    const items = parseRssItems(loadFixture('rss-feed.xml'));
    expect(items.length).toBe(3);
    expect(items[0]!.title).toBe('Mushoku Tensei v26 c264');
    expect(items[0]!.link).toBe('https://example-translator.test/mushoku-v26c264');
    expect(items[0]!.pubDate.toISOString()).toBe('2026-03-24T10:00:00.000Z');
  });

  it('returns [] for malformed XML', () => {
    expect(parseRssItems('<not-xml')).toEqual([]);
  });

  it('returns [] for RSS with no items', () => {
    expect(
      parseRssItems('<?xml version="1.0"?><rss><channel><title>x</title></channel></rss>'),
    ).toEqual([]);
  });

  it('skips items missing required fields', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>only-title</title></item>
      <item><title>Good</title><link>https://x.test/g</link><pubDate>Mon, 24 Mar 2026 10:00:00 +0000</pubDate></item>
    </channel></rss>`;
    const items = parseRssItems(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe('Good');
  });
});
