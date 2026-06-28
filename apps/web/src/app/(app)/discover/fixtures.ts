// Discovery fixtures (web). Same shape as apps/mobile/src/screens/discover/fixtures.ts;
// canonical until a real /api/discover route lands.

export type DType = 'manga' | 'light_novel' | 'comic' | 'ebook' | 'audiobook';

export const DTYPES: ReadonlyArray<{ k: DType; label: string; hue: number }> = [
  { k: 'manga',       label: 'Manga',        hue: 12 },
  { k: 'light_novel', label: 'Light Novel',  hue: 220 },
  { k: 'comic',       label: 'Comic',        hue: 45 },
  { k: 'ebook',       label: 'eBook',        hue: 160 },
  { k: 'audiobook',   label: 'Audiobook',    hue: 290 },
];

export const DLABEL: Record<DType, string> = Object.fromEntries(
  DTYPES.map((t) => [t.k, t.label]),
) as Record<DType, string>;

export const DSOURCES = ['AniList', 'MangaDex', 'ComicVine', 'OpenLibrary', 'Audnex'] as const;

export interface BrowseItem {
  t: string;
  k: DType;
  author: string;
  hue: number;
  inLib?: boolean;
}

// CSS token names for content-type accents. The design-system CSS variables use
// the short forms (--color-novel, --color-audio); the DType keys use the full
// canonical names matching @bookkeeprr/types ContentType.
export const TOKEN_FOR_TYPE: Record<DType, string> = {
  manga:       'manga',
  light_novel: 'novel',
  comic:       'comic',
  ebook:       'ebook',
  audiobook:   'audio',
};

const TRENDING: BrowseItem[] = [
  { t: 'Frieren: Beyond Journey’s End', k: 'manga',       author: 'Kanehito Yamada', hue: 175 },
  { t: 'Dungeon Meshi',                       k: 'manga',       author: 'Ryoko Kui',        hue: 35 },
  { t: 'The Apothecary Diaries',              k: 'light_novel', author: 'Natsu Hyuuga',     hue: 150 },
  { t: 'Saga',                                k: 'comic',       author: 'Brian K. Vaughan', hue: 60 },
  { t: 'Project Hail Mary',                   k: 'ebook',       author: 'Andy Weir',        hue: 150 },
  { t: 'The Three-Body Problem',              k: 'audiobook',   author: 'Liu Cixin',        hue: 300 },
];
const POPULAR: BrowseItem[] = [
  { t: 'Berserk',            k: 'manga',       author: 'Kentaro Miura',    hue: 340 },
  { t: 'Re:Zero',            k: 'light_novel', author: 'Tappei Nagatsuki', hue: 220 },
  { t: 'Monstress',          k: 'comic',       author: 'Marjorie Liu',     hue: 280 },
  { t: 'Piranesi',           k: 'ebook',       author: 'Susanna Clarke',   hue: 200 },
  { t: 'Kafka on the Shore', k: 'audiobook',   author: 'Haruki Murakami',  hue: 170 },
  { t: 'Chainsaw Man',       k: 'manga',       author: 'Tatsuki Fujimoto', hue: 0 },
];
const FRESH: BrowseItem[] = [
  { t: 'Witch Hat Atelier', k: 'manga',       author: 'Kamome Shirahama', hue: 250 },
  { t: 'Spice and Wolf',    k: 'light_novel', author: 'Isuna Hasekura',   hue: 30 },
  { t: 'Vinland Saga',      k: 'manga',       author: 'Makoto Yukimura',  hue: 12 },
  { t: 'The Sandman',       k: 'comic',       author: 'Neil Gaiman',      hue: 265 },
  { t: 'Babel',             k: 'ebook',       author: 'R. F. Kuang',      hue: 95 },
  { t: 'Dune',              k: 'audiobook',   author: 'Frank Herbert',    hue: 35 },
];

export const BROWSE_ROWS: ReadonlyArray<{
  id: string;
  label: string;
  meta: string;
  data: BrowseItem[];
}> = [
  { id: 'trending', label: 'Trending now',        meta: 'Across all sources', data: TRENDING },
  { id: 'popular',  label: 'Popular this season', meta: 'AniList · top 50', data: POPULAR },
  { id: 'fresh',    label: 'New this week',        meta: '38 new entries',    data: FRESH },
];

function vols(base: string, n: number, k: DType, hue: number, author: string): BrowseItem[] {
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
    results: vols('Classroom of the Elite', 7, 'light_novel', 220, 'Shōgo Kinugasa'),
  },
  mixed: {
    query: 'Vinland Saga',
    sub: 'Mixed media · 4 sources',
    results: [
      { t: 'Vinland Saga (Deluxe)',     k: 'manga',       hue: 12,  author: 'Makoto Yukimura', inLib: true },
      { t: 'Vinland Saga',              k: 'manga',       hue: 12,  author: 'Makoto Yukimura' },
      { t: 'Vinland Saga · Light Novel', k: 'light_novel', hue: 220, author: 'Makoto Yukimura' },
      { t: 'A History of Vikings',      k: 'ebook',       hue: 30,  author: 'Gwyn Jones' },
      { t: 'Vinland Saga: Audio Drama', k: 'audiobook',   hue: 290, author: 'Audible Original' },
      { t: 'Saga of the Greenlanders',  k: 'ebook',       hue: 150, author: 'Anonymous' },
    ],
  },
  saga: {
    query: 'Saga',
    sub: 'Comics & audio · mixed',
    results: [
      { t: 'Saga',                    k: 'comic',     hue: 60,  author: 'Brian K. Vaughan', inLib: true },
      { t: 'Saga: Compendium One',    k: 'comic',     hue: 60,  author: 'Brian K. Vaughan' },
      { t: 'Saga, Volume 1',          k: 'ebook',     hue: 200, author: 'Brian K. Vaughan' },
      { t: 'The Saga of the Volsungs', k: 'audiobook', hue: 290, author: 'Anonymous' },
      { t: 'Njal’s Saga',        k: 'audiobook', hue: 290, author: 'Anonymous' },
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
  light_novel: number;
  comic: number;
  ebook: number;
  audiobook: number;
}

export function computeCounts(results: BrowseItem[]): CountBreakdown {
  return {
    all:         results.length,
    manga:       results.filter((r) => r.k === 'manga').length,
    light_novel: results.filter((r) => r.k === 'light_novel').length,
    comic:       results.filter((r) => r.k === 'comic').length,
    ebook:       results.filter((r) => r.k === 'ebook').length,
    audiobook:   results.filter((r) => r.k === 'audiobook').length,
  };
}
