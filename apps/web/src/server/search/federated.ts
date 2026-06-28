import { searchBooks } from '@/server/integrations/openlibrary/client';
import { searchAudiobooks } from '@/server/integrations/audnex/client';
import { searchNovel, searchManga } from '@/server/integrations/anilist/client';
import { searchVolumes as searchComicVolumes } from '@/server/integrations/comicvine/client';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';
import { logger } from '@/server/logger';

export type FederatedHit = {
  source: 'ebook' | 'audiobook' | 'light_novel' | 'manga' | 'comic';
  foreignId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
};

type ProviderHit = {
  foreignId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
};
type ProviderFn = (term: string) => Promise<ProviderHit[]>;

const defaultEbookProvider: ProviderFn = async (q) => {
  const hits = await searchBooks(q);
  return hits.map((h) => ({
    foreignId: h.olid,
    title: h.title,
    author: h.author,
    coverUrl: h.coverUrl,
  }));
};

const defaultAudiobookProvider: ProviderFn = async (q) => {
  const hits = await searchAudiobooks(q);
  return hits.map((h) => ({
    foreignId: h.asin,
    title: h.title,
    author: h.author,
    coverUrl: h.coverUrl,
  }));
};

const defaultLightNovelProvider: ProviderFn = async (q) => {
  const hits = await searchNovel(q);
  return hits.map((h) => ({
    foreignId: String(h.anilistId),
    title: h.titleEnglish ?? h.titleRomaji ?? h.titleNative ?? '',
    author: h.author ?? null,
    coverUrl: h.coverUrl,
  }));
};

const defaultMangaProvider: ProviderFn = async (q) => {
  const hits = await searchManga(q);
  return hits.map((h) => ({
    foreignId: String(h.anilistId),
    title: h.titleEnglish ?? h.titleRomaji ?? h.titleNative ?? '',
    author: h.author ?? null,
    coverUrl: h.coverUrl,
  }));
};

const defaultComicProvider: ProviderFn = async (q) => {
  const apiKey = await comicVineApiKeySetting.get();
  if (!isComicVineConfigured(apiKey)) return [];
  const hits = await searchComicVolumes(apiKey, q);
  return hits.map((h) => ({
    foreignId: String(h.comicvineId),
    title: h.name ?? '',
    author: h.publisher ?? null,
    coverUrl: h.coverUrl,
  }));
};

let ebookProvider: ProviderFn = defaultEbookProvider;
let audiobookProvider: ProviderFn = defaultAudiobookProvider;
let lightNovelProvider: ProviderFn = defaultLightNovelProvider;
let mangaProvider: ProviderFn = defaultMangaProvider;
let comicProvider: ProviderFn = defaultComicProvider;

export function __setFederatedDepsForTests(deps: {
  ebook: ProviderFn;
  audiobook: ProviderFn;
  lightNovel: ProviderFn;
  manga: ProviderFn;
  comic: ProviderFn;
}): void {
  ebookProvider = deps.ebook;
  audiobookProvider = deps.audiobook;
  lightNovelProvider = deps.lightNovel;
  mangaProvider = deps.manga;
  comicProvider = deps.comic;
}

export function __resetFederatedForTests(): void {
  ebookProvider = defaultEbookProvider;
  audiobookProvider = defaultAudiobookProvider;
  lightNovelProvider = defaultLightNovelProvider;
  mangaProvider = defaultMangaProvider;
  comicProvider = defaultComicProvider;
}

const RESULT_CAP = 30;

export async function federatedLookup(term: string): Promise<FederatedHit[]> {
  const [eb, ab, ln, mg, cm] = await Promise.allSettled([
    ebookProvider(term),
    audiobookProvider(term),
    lightNovelProvider(term),
    mangaProvider(term),
    comicProvider(term),
  ]);
  const out: FederatedHit[] = [];
  if (eb.status === 'fulfilled') {
    for (const h of eb.value) out.push({ source: 'ebook', ...h });
  } else {
    logger()
      .child({ component: 'federatedLookup', source: 'ebook' })
      .warn({ err: eb.reason }, 'provider failed');
  }
  if (ab.status === 'fulfilled') {
    for (const h of ab.value) out.push({ source: 'audiobook', ...h });
  } else {
    logger()
      .child({ component: 'federatedLookup', source: 'audiobook' })
      .warn({ err: ab.reason }, 'provider failed');
  }
  if (ln.status === 'fulfilled') {
    for (const h of ln.value) out.push({ source: 'light_novel', ...h });
  } else {
    logger()
      .child({ component: 'federatedLookup', source: 'light_novel' })
      .warn({ err: ln.reason }, 'provider failed');
  }
  if (mg.status === 'fulfilled') {
    for (const h of mg.value) out.push({ source: 'manga', ...h });
  } else {
    logger()
      .child({ component: 'federatedLookup', source: 'manga' })
      .warn({ err: mg.reason }, 'provider failed');
  }
  if (cm.status === 'fulfilled') {
    for (const h of cm.value) out.push({ source: 'comic', ...h });
  } else {
    logger()
      .child({ component: 'federatedLookup', source: 'comic' })
      .warn({ err: cm.reason }, 'provider failed');
  }
  return out.slice(0, RESULT_CAP);
}
