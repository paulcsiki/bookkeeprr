/**
 * Task 5: buildAddBody gains a groupId parameter that must appear in the POST
 * body for every content type when set, and must be absent when null.
 */
import { buildAddBody } from '@/api/add-body';

const BASE_MANGA = {
  contentType: 'manga' as const,
  sourceId: 'anilist:12345',
  title: 'Test Manga',
  coverUrl: null,
};

const BASE_COMIC = {
  contentType: 'comic' as const,
  sourceId: '99',
  title: 'Test Comic',
  coverUrl: null,
};

const BASE_NOVEL = {
  contentType: 'novel' as const,
  sourceId: 'nu:test-slug',
  title: 'Test Novel',
  coverUrl: null,
};

const BASE_EBOOK = {
  contentType: 'ebook' as const,
  sourceId: 'OL12345W',
  title: 'Test Ebook',
  coverUrl: null,
};

const BASE_AUDIO = {
  contentType: 'audio' as const,
  sourceId: 'B01ABCDEFG',
  title: 'Test Audiobook',
  coverUrl: null,
};

describe('buildAddBody — groupId spread', () => {
  describe('manga', () => {
    it('includes groupId when set', () => {
      const body = buildAddBody(BASE_MANGA, 1, 7);
      expect(body).toMatchObject({ contentType: 'manga', groupId: 7 });
    });

    it('omits groupId when null', () => {
      const body = buildAddBody(BASE_MANGA, 1, null);
      expect(body).not.toHaveProperty('groupId');
    });

    it('omits groupId when not provided (default)', () => {
      const body = buildAddBody(BASE_MANGA, 1);
      expect(body).not.toHaveProperty('groupId');
    });
  });

  describe('comic', () => {
    it('includes groupId when set', () => {
      const body = buildAddBody(BASE_COMIC, 1, 3);
      expect(body).toMatchObject({ contentType: 'comic', groupId: 3 });
    });

    it('omits groupId when null', () => {
      const body = buildAddBody(BASE_COMIC, 1, null);
      expect(body).not.toHaveProperty('groupId');
    });
  });

  describe('novel (light_novel)', () => {
    it('includes groupId when set', () => {
      const body = buildAddBody(BASE_NOVEL, 1, 5);
      expect(body).toMatchObject({ contentType: 'light_novel', groupId: 5 });
    });

    it('omits groupId when null', () => {
      const body = buildAddBody(BASE_NOVEL, 1, null);
      expect(body).not.toHaveProperty('groupId');
    });
  });

  describe('ebook', () => {
    it('includes groupId when set', () => {
      const body = buildAddBody(BASE_EBOOK, 1, 2);
      expect(body).toMatchObject({ contentType: 'ebook', groupId: 2 });
    });

    it('omits groupId when null', () => {
      const body = buildAddBody(BASE_EBOOK, 1, null);
      expect(body).not.toHaveProperty('groupId');
    });
  });

  describe('audio (audiobook)', () => {
    it('includes groupId when set', () => {
      const body = buildAddBody(BASE_AUDIO, 1, 9);
      expect(body).toMatchObject({ contentType: 'audiobook', groupId: 9 });
    });

    it('omits groupId when null', () => {
      const body = buildAddBody(BASE_AUDIO, 1, null);
      expect(body).not.toHaveProperty('groupId');
    });
  });
});
