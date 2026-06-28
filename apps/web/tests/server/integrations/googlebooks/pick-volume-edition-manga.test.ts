import { describe, expect, it } from 'vitest';
import { pickVolumeEdition, type Edition } from '@/server/integrations/googlebooks/derive';

const ed = (over: Partial<Edition> = {}): Edition => ({
  id: 'aaaaaaaaQBAJ', // QBAJ => hasRealCover true
  title: 'Bleach, Vol. 25',
  publisher: 'VIZ Media LLC',
  description: 'No Shaking Throne',
  pageCount: 200,
  language: 'en',
  coverUrl: 'https://books.google.com/cover-v25.jpg',
  viewability: 'PARTIAL',
  isbn: '9781421525273',
  ...over,
});

describe('pickVolumeEdition manga option', () => {
  it('rejects a manga-titled edition by default (novel behavior preserved)', () => {
    const got = pickVolumeEdition([ed({ title: 'Bleach (Manga), Vol. 25' })], 'Bleach', 25);
    expect(got).toBeNull();
  });

  it('accepts a manga-titled edition when allowComicCategories is set', () => {
    const got = pickVolumeEdition([ed({ title: 'Bleach (Manga), Vol. 25' })], 'Bleach', 25, {
      allowComicCategories: true,
    });
    expect(got?.id).toBe('aaaaaaaaQBAJ');
  });

  it('accepts comic/manhwa labels too (not just manga)', () => {
    for (const label of ['Comic', 'Manhwa']) {
      const got = pickVolumeEdition(
        [ed({ id: `${label}QBAJ`, title: `Bleach (${label}), Vol. 25` })],
        'Bleach',
        25,
        { allowComicCategories: true },
      );
      expect(got?.id).toBe(`${label}QBAJ`);
    }
  });

  it('does not drop the manga edition when a plain edition also competes', () => {
    const manga = ed({ id: 'mangaQBAJ', title: 'Bleach (Manga), Vol. 25' });
    const plain = ed({ id: 'plainQBAJ', title: 'Bleach, Vol. 25' });
    const got = pickVolumeEdition([manga, plain], 'Bleach', 25, { allowComicCategories: true });
    // Both are valid candidates; the manga one must not be filtered out.
    expect([manga.id, plain.id]).toContain(got?.id);
  });

  it('still picks a plain volume edition with the option on', () => {
    const got = pickVolumeEdition([ed()], 'Bleach', 25, { allowComicCategories: true });
    expect(got?.title).toBe('Bleach, Vol. 25');
  });
});
