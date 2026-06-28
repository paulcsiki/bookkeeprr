import { afterEach, describe, expect, it } from 'vitest';
import {
  listProwlarrIndexers,
  testProwlarr,
  ProwlarrError,
  __setProwlarrFetcherForTests,
  __resetProwlarrForTests,
} from '@/server/integrations/prowlarr';

afterEach(() => __resetProwlarrForTests());

function resp(status: number, json: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(json)) });
}

describe('listProwlarrIndexers', () => {
  it('maps indexers + flattens categories (incl. subcats)', async () => {
    let url = ''; let key = '';
    __setProwlarrFetcherForTests((u, k) => { url = u; key = k; return resp(200, [
      { id: 1, name: 'AnimeTosho', enable: true, capabilities: { categories: [
        { id: 5000, name: 'TV', subCategories: [{ id: 5070, name: 'Anime' }] },
        { id: 7000, name: 'Books', subCategories: [{ id: 7020, name: 'EBook' }] },
      ] } },
      { id: 2, name: 'Disabled', enable: false, capabilities: { categories: [] } },
    ]); });
    const got = await listProwlarrIndexers({ url: 'http://prowlarr:9696', apiKey: 'KEY' });
    expect(url).toBe('http://prowlarr:9696/api/v1/indexer');
    expect(key).toBe('KEY');
    expect(got).toHaveLength(2);
    expect(got[0]).toEqual({ id: 1, name: 'AnimeTosho', enable: true, categories: [5000, 5070, 7000, 7020] });
    expect(got[1]!.enable).toBe(false);
  });

  it('throws auth error on 401', async () => {
    __setProwlarrFetcherForTests(() => resp(401, {}));
    await expect(listProwlarrIndexers({ url: 'http://p', apiKey: 'bad' })).rejects.toBeInstanceOf(ProwlarrError);
  });
});

describe('testProwlarr', () => {
  it('resolves on 200', async () => {
    __setProwlarrFetcherForTests((u) => { expect(u).toBe('http://p/api/v1/system/status'); return resp(200, { version: '1.0' }); });
    await expect(testProwlarr({ url: 'http://p', apiKey: 'K' })).resolves.toBeUndefined();
  });
  it('throws on 401', async () => {
    __setProwlarrFetcherForTests(() => resp(401, {}));
    await expect(testProwlarr({ url: 'http://p', apiKey: 'bad' })).rejects.toBeInstanceOf(ProwlarrError);
  });
});
