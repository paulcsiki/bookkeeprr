import { afterEach, describe, expect, it } from 'vitest';
import {
  searchTorznab,
  fetchTorznabCaps,
  TorznabError,
  __setTorznabFetcherForTests,
  __resetTorznabForTests,
} from '@/server/integrations/torznab';

afterEach(() => __resetTorznabForTests());

function resp(status: number, text: string) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(text) });
}

const SEARCH_XML = `<rss><channel>
  <item>
    <title>Atomic Habits James Clear</title>
    <guid>abc123</guid>
    <pubDate>Mon, 02 Jun 2025 10:00:00 +0000</pubDate>
    <enclosure url="http://t/x.torrent" length="123456" type="application/x-bittorrent"/>
    <torznab:attr name="seeders" value="10"/>
    <torznab:attr name="peers" value="12"/>
    <torznab:attr name="size" value="999"/>
    <torznab:attr name="infohash" value="DEAD"/>
    <torznab:attr name="magneturl" value="magnet:?xt=urn:btih:DEAD"/>
    <torznab:attr name="category" value="7020"/>
  </item>
</channel></rss>`;

describe('searchTorznab', () => {
  it('maps item attrs to an IndexerResult', async () => {
    let url = '';
    __setTorznabFetcherForTests((u) => { url = u; return resp(200, SEARCH_XML); });
    const items = await searchTorznab({ url: 'http://prowlarr/1/api', apiKey: 'KEY', q: 'atomic habits', cat: '7020,8000' });
    expect(url).toContain('t=search');
    expect(url).toContain('apikey=KEY');
    expect(url).toContain('cat=7020%2C8000');
    expect(items).toHaveLength(1);
    const r = items[0]!;
    expect(r.guid).toBe('abc123');
    expect(r.title).toBe('Atomic Habits James Clear');
    expect(r.link).toBe('magnet:?xt=urn:btih:DEAD'); // magneturl preferred over enclosure
    expect(r.sizeBytes).toBe(999); // torznab size attr preferred
    expect(r.seeders).toBe(10);
    expect(r.leechers).toBe(2); // peers(12) - seeders(10)
    expect(r.infoHash).toBe('DEAD');
    expect(r.category).toBe('7020');
  });

  it('falls back to enclosure url + length when no magneturl/size attr', async () => {
    const xml = `<rss><channel><item><title>X</title><guid>g</guid>
      <enclosure url="http://t/y.torrent" length="555"/>
      <torznab:attr name="seeders" value="3"/></item></channel></rss>`;
    __setTorznabFetcherForTests(() => resp(200, xml));
    const items = await searchTorznab({ url: 'http://x/api', apiKey: 'K', q: 'x', cat: '7020' });
    expect(items[0]!.link).toBe('http://t/y.torrent');
    expect(items[0]!.sizeBytes).toBe(555);
    expect(items[0]!.leechers).toBe(0);
  });

  it('returns [] when channel has no items', async () => {
    __setTorznabFetcherForTests(() => resp(200, `<rss><channel></channel></rss>`));
    expect(await searchTorznab({ url: 'http://x/api', apiKey: 'K', q: 'x', cat: '7020' })).toEqual([]);
  });

  it('throws auth error on 401', async () => {
    __setTorznabFetcherForTests(() => resp(401, ''));
    await expect(searchTorznab({ url: 'http://x/api', apiKey: 'bad', q: 'x', cat: '7020' })).rejects.toBeInstanceOf(TorznabError);
  });

  it('throws on malformed XML', async () => {
    __setTorznabFetcherForTests(() => resp(200, 'not xml <'));
    await expect(searchTorznab({ url: 'http://x/api', apiKey: 'K', q: 'x', cat: '7020' })).rejects.toBeInstanceOf(TorznabError);
  });
});

describe('fetchTorznabCaps', () => {
  it('returns the category tree', async () => {
    const xml = `<caps><categories>
      <category id="7000" name="Books"><subcat id="7020" name="EBook"/></category>
      <category id="3000" name="Audio"><subcat id="3030" name="Audiobook"/></category>
    </categories></caps>`;
    let url = '';
    __setTorznabFetcherForTests((u) => { url = u; return resp(200, xml); });
    const caps = await fetchTorznabCaps({ url: 'http://x/api', apiKey: 'K' });
    expect(url).toContain('t=caps');
    expect(caps.categories.map((c) => c.id)).toEqual(['7000', '3000']);
    expect(caps.categories[0]!.subcats).toEqual([{ id: '7020', name: 'EBook' }]);
  });
});

describe('TorznabError envelope (HTTP 200 with <error> body)', () => {
  it('rejects with code=auth when Prowlarr returns code 100 (wrong credentials)', async () => {
    const xml = `<?xml version="1.0"?><error code="100" description="Incorrect user credentials"/>`;
    __setTorznabFetcherForTests(() => resp(200, xml));
    const err = await searchTorznab({ url: 'http://x/api', apiKey: 'bad', q: 'x', cat: '7020' }).catch((e) => e);
    expect(err).toBeInstanceOf(TorznabError);
    expect((err as TorznabError).code).toBe('auth');
    expect((err as TorznabError).message).toContain('Incorrect user credentials');
  });

  it('rejects with code=auth when code is 101 (invalid apikey format)', async () => {
    const xml = `<?xml version="1.0"?><error code="101" description="Invalid API key format"/>`;
    __setTorznabFetcherForTests(() => resp(200, xml));
    const err = await searchTorznab({ url: 'http://x/api', apiKey: 'bad', q: 'x', cat: '7020' }).catch((e) => e);
    expect(err).toBeInstanceOf(TorznabError);
    expect((err as TorznabError).code).toBe('auth');
  });

  it('rejects with code=http for non-auth torznab error codes (e.g. 200)', async () => {
    const xml = `<?xml version="1.0"?><error code="200" description="Missing parameter"/>`;
    __setTorznabFetcherForTests(() => resp(200, xml));
    const err = await searchTorznab({ url: 'http://x/api', apiKey: 'K', q: 'x', cat: '7020' }).catch((e) => e);
    expect(err).toBeInstanceOf(TorznabError);
    expect((err as TorznabError).code).toBe('http');
    expect((err as TorznabError).message).toContain('200');
    expect((err as TorznabError).message).toContain('Missing parameter');
  });
});

describe('URL building robust to existing query string', () => {
  it('drops existing query params and produces exactly one ? when baseUrl has a query string', async () => {
    let capturedUrl = '';
    __setTorznabFetcherForTests((u) => {
      capturedUrl = u;
      return resp(200, '<rss><channel></channel></rss>');
    });
    await searchTorznab({ url: 'http://prowlarr:9696/1/api?existing=1', apiKey: 'KEY', q: 'test', cat: '7020' });
    expect(capturedUrl.split('?')).toHaveLength(2); // exactly one ?
    expect(capturedUrl).toContain('t=search');
    expect(capturedUrl).toContain('apikey=KEY');
    expect(capturedUrl).not.toContain('existing=1');
  });

  it('preserves the path when baseUrl has a query string', async () => {
    let capturedUrl = '';
    __setTorznabFetcherForTests((u) => {
      capturedUrl = u;
      return resp(200, '<caps><categories><category id="7000" name="Books"/></categories></caps>');
    });
    await fetchTorznabCaps({ url: 'http://prowlarr:9696/1/api?existing=1', apiKey: 'KEY' });
    expect(capturedUrl).toContain('/1/api?');
    expect(capturedUrl).toContain('t=caps');
    expect(capturedUrl).not.toContain('existing=1');
  });
});
