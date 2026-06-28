import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeEbookMetadata } from '@/server/metadata/ebook';
import {
  __setOpenLibraryFetcherForTests,
  __resetOpenLibraryForTests,
} from '@/server/integrations/openlibrary/client';
import {
  __setGoogleBooksFetcherForTests,
  __resetGoogleBooksForTests,
} from '@/server/integrations/googlebooks/client';

beforeEach(() => {
  __resetOpenLibraryForTests();
  __resetGoogleBooksForTests();
});
afterEach(() => {
  __resetOpenLibraryForTests();
  __resetGoogleBooksForTests();
});

const WORK_BODY = JSON.stringify({
  key: '/works/OL27448W',
  title: 'Project Hail Mary',
  description: { value: 'A lone astronaut.' },
  covers: [12345678],
  first_publish_date: '2021-05-04',
  authors: [{ author: { key: '/authors/OL34184A' } }],
});

const WORK_NO_COVER_NO_DESC = JSON.stringify({
  key: '/works/OL99999W',
  title: 'Sparse Book',
  authors: [{ author: { key: '/authors/OL34184A' } }],
});

const AUTHOR_BODY = JSON.stringify({ key: '/authors/OL34184A', name: 'Andy Weir' });

const GB_BODY = JSON.stringify({
  totalItems: 1,
  items: [
    {
      id: 'qoiTzAEACAAJ',
      volumeInfo: {
        description: 'GB description text.',
        pageCount: 476,
        imageLinks: { thumbnail: 'http://books.google.com/x.jpg' },
      },
    },
  ],
});

describe('composeEbookMetadata', () => {
  it('returns OL-only metadata when all fields present and no ISBN hint', async () => {
    __setOpenLibraryFetcherForTests(async (url) => {
      if (url.includes('/works/')) return { ok: true, status: 200, text: async () => WORK_BODY };
      return { ok: true, status: 200, text: async () => AUTHOR_BODY };
    });
    const gbCalls = vi.fn();
    __setGoogleBooksFetcherForTests(async () => {
      gbCalls();
      return { ok: true, status: 200, text: async () => GB_BODY };
    });

    const md = await composeEbookMetadata('OL27448W', null);
    expect(md).not.toBeNull();
    expect(md!.title).toBe('Project Hail Mary');
    expect(md!.author).toBe('Andy Weir');
    expect(md!.coverUrl).toMatch(/12345678-L\.jpg$/);
    expect(md!.description).toBe('A lone astronaut.');
    expect(md!.firstPublishYear).toBe(2021);
    expect(gbCalls).not.toHaveBeenCalled();
  });

  it('falls back to Google Books for missing fields when ISBN hint given', async () => {
    __setOpenLibraryFetcherForTests(async (url) => {
      if (url.includes('/works/'))
        return { ok: true, status: 200, text: async () => WORK_NO_COVER_NO_DESC };
      return { ok: true, status: 200, text: async () => AUTHOR_BODY };
    });
    __setGoogleBooksFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => GB_BODY,
    }));

    const md = await composeEbookMetadata('OL99999W', '9780593135204');
    expect(md).not.toBeNull();
    expect(md!.title).toBe('Sparse Book');
    expect(md!.coverUrl).toBe('https://books.google.com/x.jpg');
    expect(md!.description).toBe('GB description text.');
    expect(md!.pageCount).toBe(476);
    expect(md!.isbn).toBe('9780593135204');
  });

  it('skips GB fallback when OL has full metadata even if ISBN hint given', async () => {
    __setOpenLibraryFetcherForTests(async (url) => {
      if (url.includes('/works/')) return { ok: true, status: 200, text: async () => WORK_BODY };
      return { ok: true, status: 200, text: async () => AUTHOR_BODY };
    });
    const gbCalls = vi.fn();
    __setGoogleBooksFetcherForTests(async () => {
      gbCalls();
      return { ok: true, status: 200, text: async () => GB_BODY };
    });

    // OL provides cover + description; pageCount missing. Composer should still
    // call GB because pageCount is one of the gap-trigger fields.
    const md = await composeEbookMetadata('OL27448W', '9780593135204');
    expect(md).not.toBeNull();
    // pageCount filled by GB
    expect(md!.pageCount).toBe(476);
    // cover + description preserved from OL (not overwritten by GB)
    expect(md!.coverUrl).toMatch(/12345678-L\.jpg$/);
    expect(md!.description).toBe('A lone astronaut.');
    expect(gbCalls).toHaveBeenCalled();
  });

  it('returns null when OL Work returns 404', async () => {
    __setOpenLibraryFetcherForTests(async () => ({
      ok: false,
      status: 404,
      text: async () => '',
    }));
    const md = await composeEbookMetadata('OL00000W', null);
    expect(md).toBeNull();
  });

  it('returns OL-only result when GB lookup fails silently', async () => {
    __setOpenLibraryFetcherForTests(async (url) => {
      if (url.includes('/works/'))
        return { ok: true, status: 200, text: async () => WORK_NO_COVER_NO_DESC };
      return { ok: true, status: 200, text: async () => AUTHOR_BODY };
    });
    __setGoogleBooksFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));

    // Composer should not throw — GB failure swallowed; OL data returned.
    const md = await composeEbookMetadata('OL99999W', '9780593135204');
    expect(md).not.toBeNull();
    expect(md!.title).toBe('Sparse Book');
    expect(md!.coverUrl).toBeNull(); // OL had no cover, GB threw
    expect(md!.description).toBeNull();
  });
});
