// Discovery fixtures — mirror the canonical design bundle's data shape.
// These render the screen end-to-end before the /api/discover route is wired
// to real provider trending/popular/fresh endpoints.

import type { ContentType } from '@/api/schemas';

export const DTYPES: ReadonlyArray<{ k: ContentType; label: string; hue: number }> = [
  { k: 'manga', label: 'Manga', hue: 12 },
  { k: 'novel', label: 'Light Novel', hue: 220 },
  { k: 'comic', label: 'Comic', hue: 45 },
  { k: 'ebook', label: 'eBook', hue: 160 },
  { k: 'audio', label: 'Audiobook', hue: 290 },
];

export const DLABEL: Record<ContentType, string> = Object.fromEntries(
  DTYPES.map((t) => [t.k, t.label]),
) as Record<ContentType, string>;

// External metadata sources cycled in the loader caption.
export const DSOURCES = ['AniList', 'MangaDex', 'ComicVine', 'OpenLibrary', 'Audnex'] as const;

export interface BrowseItem {
  t: string;
  k: ContentType;
  author: string;
  isbn?: string;
  hue: number;
  inLib?: boolean;
}

const TRENDING: BrowseItem[] = [
  { t: 'Frieren: Beyond Journey’s End', k: 'manga', author: 'Kanehito Yamada', isbn: '9781974725038', hue: 175 },
  { t: 'Dungeon Meshi',                     k: 'manga', author: 'Ryoko Kui',        isbn: '9781975312428', hue: 35 },
  { t: 'The Apothecary Diaries',            k: 'novel', author: 'Natsu Hyuuga',     isbn: '9781642751529', hue: 150 },
  { t: 'Saga',                              k: 'comic', author: 'Brian K. Vaughan', isbn: '9781607066019', hue: 60 },
  { t: 'Project Hail Mary',                 k: 'ebook', author: 'Andy Weir',        isbn: '9780593135204', hue: 150 },
  { t: 'The Three-Body Problem',            k: 'audio', author: 'Liu Cixin',        isbn: '9780765382030', hue: 300 },
];

const POPULAR: BrowseItem[] = [
  { t: 'Berserk',            k: 'manga', author: 'Kentaro Miura',    isbn: '9781506711980', hue: 340 },
  { t: 'Re:Zero',            k: 'novel', author: 'Tappei Nagatsuki', isbn: '9780316315302', hue: 220 },
  { t: 'Monstress',          k: 'comic', author: 'Marjorie Liu',     isbn: '9781632157096', hue: 280 },
  { t: 'Piranesi',           k: 'ebook', author: 'Susanna Clarke',   isbn: '9781635575637', hue: 200 },
  { t: 'Kafka on the Shore', k: 'audio', author: 'Haruki Murakami',  isbn: '9781400079278', hue: 170 },
  { t: 'Chainsaw Man',       k: 'manga', author: 'Tatsuki Fujimoto', isbn: '9781974709939', hue: 0 },
];

const FRESH: BrowseItem[] = [
  { t: 'Witch Hat Atelier', k: 'manga', author: 'Kamome Shirahama', isbn: '9781632367709', hue: 250 },
  { t: 'Spice and Wolf',    k: 'novel', author: 'Isuna Hasekura',   isbn: '9780759531048', hue: 30 },
  { t: 'Vinland Saga',      k: 'manga', author: 'Makoto Yukimura',  isbn: '9781612624204', hue: 12 },
  { t: 'The Sandman',       k: 'comic', author: 'Neil Gaiman',      isbn: '9781563892271', hue: 265 },
  { t: 'Babel',             k: 'ebook', author: 'R. F. Kuang',      isbn: '9780063021426', hue: 95 },
  { t: 'Dune',              k: 'audio', author: 'Frank Herbert',    isbn: '9780441013593', hue: 35 },
];

export const BROWSE_ROWS: ReadonlyArray<{
  id: string;
  label: string;
  meta: string;
  data: BrowseItem[];
}> = [
  { id: 'trending', label: 'Trending now',         meta: 'Across all sources', data: TRENDING },
  { id: 'popular',  label: 'Popular this season',  meta: 'AniList · top 50', data: POPULAR },
  { id: 'fresh',    label: 'New this week',        meta: '38 new entries',    data: FRESH },
];

function vols(base: string, n: number, k: ContentType, hue: number, author: string): BrowseItem[] {
  return Array.from({ length: n }, (_, i) => ({
    t: `${base}, Vol. ${i + 1}`,
    k,
    author,
    hue: hue + (i - n / 2) * 6,
  }));
}

export interface ResultSet {
  query: string;
  sub: string;
  results: BrowseItem[];
}

export const RESULT_SETS: Record<string, ResultSet> = {
  classroom: {
    query: 'Classroom of the Elite',
    sub: 'Light-novel series · Year 1',
    results: vols('Classroom of the Elite', 7, 'novel', 220, 'Shōgo Kinugasa'),
  },
  mixed: {
    query: 'Vinland Saga',
    sub: 'Mixed media · 4 sources',
    results: [
      { t: 'Vinland Saga (Deluxe)',          k: 'manga', hue: 12,  author: 'Makoto Yukimura', inLib: true },
      { t: 'Vinland Saga',                    k: 'manga', hue: 12,  author: 'Makoto Yukimura' },
      { t: 'Vinland Saga · Light Novel', k: 'novel', hue: 220, author: 'Makoto Yukimura' },
      { t: 'A History of Vikings',            k: 'ebook', hue: 30,  author: 'Gwyn Jones' },
      { t: 'Vinland Saga: Audio Drama',       k: 'audio', hue: 290, author: 'Audible Original' },
      { t: 'Saga of the Greenlanders',        k: 'ebook', hue: 150, author: 'Anonymous' },
    ],
  },
  saga: {
    query: 'Saga',
    sub: 'Comics & audio · mixed',
    results: [
      { t: 'Saga',                      k: 'comic', hue: 60,  author: 'Brian K. Vaughan', inLib: true },
      { t: 'Saga: Compendium One',      k: 'comic', hue: 60,  author: 'Brian K. Vaughan' },
      { t: 'Saga, Volume 1',            k: 'ebook', hue: 200, author: 'Brian K. Vaughan' },
      { t: 'The Saga of the Volsungs', k: 'audio', hue: 290, author: 'Anonymous' },
      { t: 'Njal’s Saga',         k: 'audio', hue: 290, author: 'Anonymous' },
    ],
  },
};

export const SUGGESTIONS: ReadonlyArray<{ key: keyof typeof RESULT_SETS; label: string }> = [
  { key: 'classroom', label: 'Classroom of the Elite' },
  { key: 'mixed',     label: 'Vinland Saga' },
  { key: 'saga',      label: 'Saga' },
];

export interface CountBreakdown {
  all: number;
  manga: number;
  novel: number;
  comic: number;
  ebook: number;
  audio: number;
}

export function computeCounts(results: BrowseItem[]): CountBreakdown {
  return {
    all: results.length,
    manga: results.filter((r) => r.k === 'manga').length,
    novel: results.filter((r) => r.k === 'novel').length,
    comic: results.filter((r) => r.k === 'comic').length,
    ebook: results.filter((r) => r.k === 'ebook').length,
    audio: results.filter((r) => r.k === 'audio').length,
  };
}
