import { afterEach, describe, expect, it } from 'vitest';
import {
  federatedLookup,
  __setFederatedDepsForTests,
  __resetFederatedForTests,
} from '@/server/search/federated';

afterEach(() => __resetFederatedForTests());

describe('federatedLookup', () => {
  it('combines hits from all three providers', async () => {
    __setFederatedDepsForTests({
      ebook: async (q: string) => [
        { foreignId: 'OL1W', title: `Foo (ebook ${q})`, author: 'A', coverUrl: null },
      ],
      audiobook: async (q: string) => [
        { foreignId: 'B0AB', title: `Foo (audio ${q})`, author: 'A', coverUrl: null },
      ],
      lightNovel: async (q: string) => [
        { foreignId: '105778', title: `Foo (LN ${q})`, author: 'A', coverUrl: null },
      ],
      manga: async () => [],
      comic: async () => [],
    });
    const hits = await federatedLookup('Foo');
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.source).sort()).toEqual(['audiobook', 'ebook', 'light_novel']);
  });

  it('returns partial results when one provider fails', async () => {
    __setFederatedDepsForTests({
      ebook: async () => [{ foreignId: 'OL1W', title: 'Foo', author: 'A', coverUrl: null }],
      audiobook: async () => {
        throw new Error('audnex down');
      },
      lightNovel: async () => [{ foreignId: '105778', title: 'Foo', author: 'A', coverUrl: null }],
      manga: async () => [],
      comic: async () => [],
    });
    const hits = await federatedLookup('Foo');
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.source).sort()).toEqual(['ebook', 'light_novel']);
  });

  it('returns empty array when all three providers fail', async () => {
    __setFederatedDepsForTests({
      ebook: async () => {
        throw new Error('ol down');
      },
      audiobook: async () => {
        throw new Error('audnex down');
      },
      lightNovel: async () => {
        throw new Error('anilist down');
      },
      manga: async () => [],
      comic: async () => [],
    });
    const hits = await federatedLookup('Foo');
    expect(hits).toEqual([]);
  });

  it('caps results at 30', async () => {
    const many = Array.from({ length: 50 }).map((_, i) => ({
      foreignId: `OL${i}W`,
      title: `t${i}`,
      author: 'A',
      coverUrl: null,
    }));
    __setFederatedDepsForTests({
      ebook: async () => many,
      audiobook: async () => [],
      lightNovel: async () => [],
      manga: async () => [],
      comic: async () => [],
    });
    const hits = await federatedLookup('Foo');
    expect(hits).toHaveLength(30);
  });

  it('combines hits from all five providers', async () => {
    __setFederatedDepsForTests({
      ebook: async () => [{ foreignId: 'OL1', title: 'eb', author: 'A', coverUrl: null }],
      audiobook: async () => [{ foreignId: 'B0A', title: 'ab', author: 'A', coverUrl: null }],
      lightNovel: async () => [{ foreignId: '111', title: 'ln', author: 'A', coverUrl: null }],
      manga: async () => [{ foreignId: '222', title: 'mg', author: null, coverUrl: null }],
      comic: async () => [{ foreignId: '333', title: 'cm', author: 'Pub', coverUrl: null }],
    });
    const hits = await federatedLookup('Foo');
    expect(hits).toHaveLength(5);
    expect(hits.map((h) => h.source).sort()).toEqual([
      'audiobook',
      'comic',
      'ebook',
      'light_novel',
      'manga',
    ]);
  });

  it('manga provider failure does not block other sources', async () => {
    __setFederatedDepsForTests({
      ebook: async () => [{ foreignId: 'OL1', title: 'eb', author: 'A', coverUrl: null }],
      audiobook: async () => [],
      lightNovel: async () => [],
      manga: async () => {
        throw new Error('anilist down');
      },
      comic: async () => [{ foreignId: '333', title: 'cm', author: 'Pub', coverUrl: null }],
    });
    const hits = await federatedLookup('Foo');
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.source).sort()).toEqual(['comic', 'ebook']);
  });

  it('comic provider returns empty when ComicVine is unconfigured', async () => {
    __setFederatedDepsForTests({
      ebook: async () => [],
      audiobook: async () => [],
      lightNovel: async () => [],
      manga: async () => [],
      comic: async () => [], // simulates the "no api key" early-return inside defaultComicProvider
    });
    const hits = await federatedLookup('Foo');
    expect(hits).toEqual([]);
  });
});
