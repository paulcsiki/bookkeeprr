import {
  IndexerView,
  IndexersResponse,
  IndexerConfig,
  NyaaConfig,
  FilelistConfig,
  TorznabConfig,
  MamConfig,
  TorznabCaps,
  ProwlarrSyncResult,
  ProwlarrConfig,
  parseIndexerConfig,
} from '@/api/schemas/indexers';

describe('IndexerView', () => {
  it('parses a nyaa indexer (configJson as a JSON string)', () => {
    const cfg: NyaaConfig = {
      kind: 'nyaa',
      queryTemplate: '{title} {extra}',
      contentTypes: ['manga', 'comic'],
      categoryByContentType: { manga: '3_1', comic: '3_3' },
      pollIntervalSeconds: 900,
    };
    const view = IndexerView.parse({
      id: 1,
      kind: 'nyaa',
      name: 'nyaa.si',
      baseUrl: 'https://nyaa.si',
      enabled: true,
      configJson: JSON.stringify(cfg),
      lastRssAt: '2026-06-09T00:00:00.000Z',
      lastSearchAt: null,
    });
    expect(view.kind).toBe('nyaa');
    expect(view.lastSearchAt).toBeNull();
    const parsed = parseIndexerConfig(view.configJson);
    expect(parsed.kind).toBe('nyaa');
    if (parsed.kind === 'nyaa') {
      expect(parsed.categoryByContentType.manga).toBe('3_1');
      expect(parsed.contentTypes).toEqual(['manga', 'comic']);
    }
  });

  it('parses a filelist indexer config (numeric categories, masked passkey)', () => {
    const cfg: FilelistConfig = {
      kind: 'filelist',
      queryTemplate: '{title}',
      contentTypes: ['ebook'],
      categoryByContentType: { ebook: 19 },
      username: 'bob',
      passkey: '',
      pollIntervalSeconds: 1800,
    };
    const parsed = IndexerConfig.parse(cfg);
    expect(parsed.kind).toBe('filelist');
    if (parsed.kind === 'filelist') {
      expect(parsed.categoryByContentType.ebook).toBe(19);
      expect(parsed.username).toBe('bob');
      expect(parsed.passkey).toBe('');
    }
  });

  it('parses a mam indexer config (numeric categories, masked mamId, searchIn round-trips)', () => {
    const cfg: MamConfig = {
      kind: 'mam',
      queryTemplate: '{title}',
      contentTypes: ['ebook', 'audiobook', 'light_novel'],
      categoryByContentType: { ebook: 14, audiobook: 13, light_novel: 14 },
      mamId: '', // masked to '' on GET
      proxyUrl: '',
      searchIn: ['title'],
      pollIntervalSeconds: 900,
    };
    const parsed = IndexerConfig.parse(cfg);
    expect(parsed.kind).toBe('mam');
    if (parsed.kind === 'mam') {
      expect(parsed.categoryByContentType.ebook).toBe(14);
      expect(parsed.categoryByContentType.audiobook).toBe(13);
      expect(parsed.mamId).toBe('');
      expect(parsed.searchIn).toEqual(['title']);
    }
  });

  it('parses a mam IndexerView (kind accepted, configJson round-trips via parseIndexerConfig)', () => {
    const view = IndexerView.parse({
      id: 5,
      kind: 'mam',
      name: 'MAM',
      baseUrl: 'https://www.myanonamouse.net',
      enabled: true,
      configJson: JSON.stringify({
        kind: 'mam',
        queryTemplate: '{title}',
        contentTypes: ['ebook'],
        categoryByContentType: { ebook: 14 },
        mamId: '',
        proxyUrl: '',
        searchIn: ['title'],
        pollIntervalSeconds: 900,
      }),
      lastRssAt: null,
      lastSearchAt: null,
    });
    expect(view.kind).toBe('mam');
    const cfg = parseIndexerConfig(view.configJson);
    expect(cfg.kind).toBe('mam');
    if (cfg.kind === 'mam') {
      expect(cfg.mamId).toBe('');
      expect(cfg.searchIn).toEqual(['title']);
      expect(cfg.categoryByContentType.ebook).toBe(14);
    }
  });

  it('parses a torznab indexer config (csv categories, optional prowlarrIndexerId)', () => {
    const cfg: TorznabConfig = {
      kind: 'torznab',
      queryTemplate: '{title}',
      contentTypes: ['light_novel', 'audiobook'],
      categoryByContentType: { light_novel: '7020', audiobook: '3030' },
      apiKey: '',
      pollIntervalSeconds: 900,
      prowlarrIndexerId: 42,
    };
    const parsed = IndexerConfig.parse(cfg);
    expect(parsed.kind).toBe('torznab');
    if (parsed.kind === 'torznab') {
      expect(parsed.categoryByContentType.light_novel).toBe('7020');
      expect(parsed.prowlarrIndexerId).toBe(42);
    }
  });
});

describe('IndexersResponse', () => {
  it('parses an indexers list response', () => {
    const res = IndexersResponse.parse({
      indexers: [
        {
          id: 1,
          kind: 'nyaa',
          name: 'nyaa.si',
          baseUrl: 'https://nyaa.si',
          enabled: true,
          configJson: '{"kind":"nyaa","queryTemplate":"{title}","contentTypes":[],"categoryByContentType":{},"pollIntervalSeconds":900}',
          lastRssAt: null,
          lastSearchAt: null,
        },
      ],
    });
    expect(res.indexers).toHaveLength(1);
    expect(res.indexers[0]!.name).toBe('nyaa.si');
  });
});

describe('TorznabCaps', () => {
  it('parses a caps response with nested subcats', () => {
    const caps = TorznabCaps.parse({
      categories: [
        {
          id: '7000',
          name: 'Books',
          subcats: [
            { id: '7020', name: 'eBook' },
            { id: '7030', name: 'Comics' },
          ],
        },
      ],
    });
    expect(caps.categories).toHaveLength(1);
    expect(caps.categories[0]!.subcats).toHaveLength(2);
    expect(caps.categories[0]!.subcats[0]!.id).toBe('7020');
  });
});

describe('ProwlarrSyncResult', () => {
  it('parses the sync summary', () => {
    const r = ProwlarrSyncResult.parse({ added: 2, updated: 1, disabled: 0 });
    expect(r).toEqual({ added: 2, updated: 1, disabled: 0 });
  });
});

describe('ProwlarrConfig', () => {
  it('parses a prowlarr connection (apiKey masked)', () => {
    const c = ProwlarrConfig.parse({ url: 'http://prowlarr:9696', apiKey: '' });
    expect(c.url).toBe('http://prowlarr:9696');
    expect(c.apiKey).toBe('');
  });
});
