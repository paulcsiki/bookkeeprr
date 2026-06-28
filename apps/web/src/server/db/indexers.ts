import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { indexers, type IndexerRow } from './schema';
import { withWriteLock } from './write-lock';
import { seededIndexerKindsSetting } from './settings/seeded-indexers';
import type {
  IndexerKind,
  IndexerConfig,
  NyaaConfig,
  FilelistConfig,
  TorznabConfig,
  MamConfig,
  NyaaCategory,
} from '@/server/integrations/indexers/types';
import { CONTENT_TYPES, isContentType } from '@/server/content-type';
import type { ContentType } from '@/server/content-type';

export type { IndexerKind, IndexerConfig } from '@/server/integrations/indexers/types';

export type IndexerUpdate = Partial<{
  enabled: boolean;
  configJson: IndexerConfig;
  name: string;
  baseUrl: string;
}>;

const DEFAULT_QUERY_TEMPLATE = '{title} {extra}';

function isNyaaCategory(x: unknown): x is NyaaCategory {
  return x === '3_1' || x === '3_3';
}

function safeContentTypes(x: unknown): ContentType[] {
  if (!Array.isArray(x)) return [];
  return x.filter(isContentType);
}

function safeCategoriesNyaa(x: unknown): Partial<Record<ContentType, NyaaCategory>> {
  if (!x || typeof x !== 'object') return {};
  const out: Partial<Record<ContentType, NyaaCategory>> = {};
  for (const ct of CONTENT_TYPES) {
    const v = (x as Record<string, unknown>)[ct];
    if (isNyaaCategory(v)) out[ct] = v;
  }
  return out;
}

function safeCategoriesFilelist(x: unknown): Partial<Record<ContentType, number>> {
  if (!x || typeof x !== 'object') return {};
  const out: Partial<Record<ContentType, number>> = {};
  for (const ct of CONTENT_TYPES) {
    const v = (x as Record<string, unknown>)[ct];
    if (typeof v === 'number' && Number.isFinite(v)) out[ct] = v;
    else if (typeof v === 'string' && /^\d+$/.test(v)) out[ct] = Number(v);
  }
  return out;
}

function safeCategoriesTorznab(raw: unknown): Partial<Record<ContentType, string>> {
  const out: Partial<Record<ContentType, string>> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (CONTENT_TYPES.includes(k as ContentType) && typeof v === 'string' && v.length > 0) {
        out[k as ContentType] = v;
      }
    }
  }
  return out;
}

const MAM_SEARCH_IN = [
  'title',
  'author',
  'narrator',
  'series',
  'description',
  'filenames',
  'fileTypes',
  'tags',
] as const;

function safeSearchIn(x: unknown): string[] {
  if (!Array.isArray(x)) return ['title'];
  const out = x.filter(
    (v): v is string => typeof v === 'string' && (MAM_SEARCH_IN as readonly string[]).includes(v),
  );
  return out.length > 0 ? out : ['title'];
}

function safePollInterval(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x) || !Number.isInteger(x)) return 900;
  if (x < 60 || x > 86400) return 900;
  return x;
}

export function parseIndexerConfig(raw: string, kind: IndexerKind): IndexerConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const obj: Record<string, unknown> =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  if (kind === 'nyaa') {
    const queryTemplate =
      typeof obj.queryTemplate === 'string' ? obj.queryTemplate : DEFAULT_QUERY_TEMPLATE;

    // Legacy migration: { defaultCategory: '3_1' | '3_3' } → categoryByContentType
    if (obj.categoryByContentType === undefined && obj.defaultCategory !== undefined) {
      const legacy = isNyaaCategory(obj.defaultCategory) ? obj.defaultCategory : '3_1';
      const cfg: NyaaConfig = {
        kind: 'nyaa',
        queryTemplate,
        contentTypes: ['manga', 'comic'],
        categoryByContentType: { manga: legacy, comic: legacy },
        pollIntervalSeconds: safePollInterval(obj.pollIntervalSeconds),
      };
      return cfg;
    }

    const explicitTypes = safeContentTypes(obj.contentTypes);
    const cfg: NyaaConfig = {
      kind: 'nyaa',
      queryTemplate,
      contentTypes: explicitTypes.length > 0 ? explicitTypes : ['manga', 'comic'],
      categoryByContentType:
        obj.categoryByContentType === undefined
          ? { manga: '3_1', comic: '3_1' }
          : safeCategoriesNyaa(obj.categoryByContentType),
      pollIntervalSeconds: safePollInterval(obj.pollIntervalSeconds),
    };
    return cfg;
  }

  if (kind === 'torznab') {
    const cfg: TorznabConfig = {
      kind: 'torznab',
      queryTemplate:
        typeof obj.queryTemplate === 'string' ? obj.queryTemplate : DEFAULT_QUERY_TEMPLATE,
      contentTypes: safeContentTypes(obj.contentTypes),
      categoryByContentType: safeCategoriesTorznab(obj.categoryByContentType),
      apiKey: typeof obj.apiKey === 'string' ? obj.apiKey : '',
      pollIntervalSeconds: safePollInterval(obj.pollIntervalSeconds),
      ...(typeof obj.prowlarrIndexerId === 'number'
        ? { prowlarrIndexerId: obj.prowlarrIndexerId }
        : {}),
    };
    return cfg;
  }

  if (kind === 'mam') {
    const cfg: MamConfig = {
      kind: 'mam',
      queryTemplate:
        typeof obj.queryTemplate === 'string' ? obj.queryTemplate : DEFAULT_QUERY_TEMPLATE,
      contentTypes: safeContentTypes(obj.contentTypes),
      categoryByContentType: safeCategoriesFilelist(obj.categoryByContentType),
      mamId: typeof obj.mamId === 'string' ? obj.mamId : '',
      proxyUrl: typeof obj.proxyUrl === 'string' ? obj.proxyUrl : '',
      searchIn: safeSearchIn(obj.searchIn),
      pollIntervalSeconds: safePollInterval(obj.pollIntervalSeconds),
    };
    return cfg;
  }

  if (kind === 'manual') {
    return {
      kind: 'manual',
      queryTemplate: typeof obj.queryTemplate === 'string' ? obj.queryTemplate : DEFAULT_QUERY_TEMPLATE,
      contentTypes: safeContentTypes(obj.contentTypes),
      categoryByContentType: safeCategoriesTorznab(obj.categoryByContentType),
      pollIntervalSeconds: safePollInterval(obj.pollIntervalSeconds),
    };
  }

  // kind === 'filelist'
  const cfg: FilelistConfig = {
    kind: 'filelist',
    queryTemplate:
      typeof obj.queryTemplate === 'string' ? obj.queryTemplate : DEFAULT_QUERY_TEMPLATE,
    contentTypes: safeContentTypes(obj.contentTypes),
    categoryByContentType: safeCategoriesFilelist(obj.categoryByContentType),
    username: typeof obj.username === 'string' ? obj.username : '',
    passkey: typeof obj.passkey === 'string' ? obj.passkey : '',
    pollIntervalSeconds: safePollInterval(obj.pollIntervalSeconds),
  };
  return cfg;
}

const NYAA_DEFAULT_CONFIG: NyaaConfig = {
  kind: 'nyaa',
  queryTemplate: DEFAULT_QUERY_TEMPLATE,
  contentTypes: ['manga', 'comic'],
  categoryByContentType: { manga: '3_1', comic: '3_1' },
  pollIntervalSeconds: 900,
};

const FILELIST_DEFAULT_CONFIG: FilelistConfig = {
  kind: 'filelist',
  queryTemplate: DEFAULT_QUERY_TEMPLATE,
  contentTypes: [],
  categoryByContentType: {},
  username: '',
  passkey: '',
  pollIntervalSeconds: 900,
};

async function ensureIndexer(
  kind: IndexerKind,
  defaults: {
    name: string;
    baseUrl: string;
    enabled: boolean;
    config: IndexerConfig;
  },
): Promise<number> {
  return withWriteLock(async () => {
    const existing = await getDb()
      .select({ id: indexers.id })
      .from(indexers)
      .where(eq(indexers.kind, kind))
      .limit(1);
    if (existing[0]) return existing[0].id;
    const [row] = await getDb()
      .insert(indexers)
      .values({
        kind,
        name: defaults.name,
        baseUrl: defaults.baseUrl,
        configJson: JSON.stringify(defaults.config),
        enabled: defaults.enabled,
      })
      .returning({ id: indexers.id });
    if (!row) throw new Error(`ensureIndexer(${kind}): insert returned no row`);
    return row.id;
  });
}

export async function seedDefaultIndexers(): Promise<{ nyaaId: number; filelistId: number }> {
  let seeded = await seededIndexerKindsSetting.get();
  const updates: string[] = [];

  let nyaaId: number;
  if (!seeded.includes('nyaa')) {
    const existing = await getDb()
      .select({ id: indexers.id })
      .from(indexers)
      .where(eq(indexers.kind, 'nyaa'))
      .limit(1);
    if (existing[0]) {
      nyaaId = existing[0].id;
    } else {
      nyaaId = await ensureIndexer('nyaa', {
        name: 'nyaa.si',
        baseUrl: 'https://nyaa.si',
        enabled: true,
        config: NYAA_DEFAULT_CONFIG,
      });
    }
    updates.push('nyaa');
  } else {
    const existing = await getDb()
      .select({ id: indexers.id })
      .from(indexers)
      .where(eq(indexers.kind, 'nyaa'))
      .limit(1);
    nyaaId = existing[0]?.id ?? 0;
  }

  let filelistId: number;
  if (!seeded.includes('filelist')) {
    const existing = await getDb()
      .select({ id: indexers.id })
      .from(indexers)
      .where(eq(indexers.kind, 'filelist'))
      .limit(1);
    if (existing[0]) {
      filelistId = existing[0].id;
    } else {
      filelistId = await ensureIndexer('filelist', {
        name: 'filelist.io',
        baseUrl: 'https://filelist.io',
        enabled: false,
        config: FILELIST_DEFAULT_CONFIG,
      });
    }
    updates.push('filelist');
  } else {
    const existing = await getDb()
      .select({ id: indexers.id })
      .from(indexers)
      .where(eq(indexers.kind, 'filelist'))
      .limit(1);
    filelistId = existing[0]?.id ?? 0;
  }

  if (updates.length > 0) {
    seeded = [...new Set([...seeded, ...updates])];
    await seededIndexerKindsSetting.set(seeded);
  }

  return { nyaaId, filelistId };
}

// Back-compat wrapper for existing test callers that expect a single id.
export async function seedDefaultIndexer(): Promise<number> {
  const { nyaaId } = await seedDefaultIndexers();
  return nyaaId;
}

export async function listEnabledIndexers(): Promise<IndexerRow[]> {
  return getDb().select().from(indexers).where(eq(indexers.enabled, true));
}

/**
 * Kinds queried ONLY by user-triggered interactive search — never by background
 * jobs or auto-grab. MyAnonaMouse is ratio-sensitive and IP-locked, so we never
 * poll or auto-grab it; the user searches and grabs it by hand.
 */
export function isManualOnlyIndexer(kind: string): boolean {
  return kind === 'mam';
}

/** Enabled indexers eligible for background polling/search (excludes manual-only kinds). */
export async function listAutomatedIndexers(): Promise<IndexerRow[]> {
  const rows = await listEnabledIndexers();
  return rows.filter((r) => !isManualOnlyIndexer(r.kind));
}

export async function listIndexers(): Promise<IndexerRow[]> {
  return getDb().select().from(indexers);
}

export async function getIndexer(id: number): Promise<IndexerRow | null> {
  const rows = await getDb().select().from(indexers).where(eq(indexers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateIndexer(id: number, patch: IndexerUpdate): Promise<void> {
  return withWriteLock(async () => {
    const setValues: Record<string, unknown> = {};
    if (patch.enabled !== undefined) setValues.enabled = patch.enabled;
    if (patch.configJson !== undefined) setValues.configJson = JSON.stringify(patch.configJson);
    if (patch.name !== undefined) setValues.name = patch.name;
    if (patch.baseUrl !== undefined) setValues.baseUrl = patch.baseUrl;
    if (Object.keys(setValues).length === 0) return;
    await getDb().update(indexers).set(setValues).where(eq(indexers.id, id));
  });
}

export async function updateIndexerLastRssAt(id: number, at: Date): Promise<void> {
  return withWriteLock(async () => {
    await getDb().update(indexers).set({ lastRssAt: at }).where(eq(indexers.id, id));
  });
}

export type IndexerInsert = {
  kind: IndexerKind;
  name: string;
  baseUrl: string;
  enabled: boolean;
  configJson: IndexerConfig;
};

export async function insertIndexer(input: IndexerInsert): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(indexers)
      .values({
        kind: input.kind,
        name: input.name,
        baseUrl: input.baseUrl,
        enabled: input.enabled,
        configJson: JSON.stringify(input.configJson),
      })
      .returning({ id: indexers.id });
    if (!row) throw new Error('insertIndexer: insert returned no row');
    return row.id;
  });
}

export async function deleteIndexer(id: number): Promise<void> {
  return withWriteLock(async () => {
    await getDb().delete(indexers).where(eq(indexers.id, id));
  });
}

/**
 * The id of the singleton "Manual" indexer — a disabled sentinel that holds
 * releases for torrents the user added to qBittorrent by hand. Created on first
 * use. It is never polled/searched (enabled = false) and is hidden from the
 * indexers UI list.
 */
export async function getOrCreateManualIndexer(): Promise<number> {
  const existing = await getDb()
    .select({ id: indexers.id })
    .from(indexers)
    .where(eq(indexers.kind, 'manual'))
    .limit(1);
  if (existing[0]) return existing[0].id;
  return insertIndexer({
    kind: 'manual',
    name: 'Manual',
    baseUrl: '',
    enabled: false,
    configJson: {
      kind: 'manual',
      queryTemplate: '',
      contentTypes: [],
      categoryByContentType: {},
      pollIntervalSeconds: 0,
    },
  });
}
