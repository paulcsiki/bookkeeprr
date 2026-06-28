import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ReadarrCommandRecord, ReadarrErrorResponse } from '@/server/openapi/schemas/readarr';
import { insertSeries } from '@/server/db/series';
import { POST as postCommand, GET as getCommandList } from '@/app/api/readarr/v1/command/route';
import { GET as getCommandById } from '@/app/api/readarr/v1/command/[id]/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('POST /api/readarr/v1/command', () => {
  it('AuthorSearch with a valid authorId enqueues missing_search', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLfoo',
      status: 'releasing',
      rootPath: '/media/books/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'A',
    });
    const r = await postCommand(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'AuthorSearch', authorId: sid }),
      }),
    );
    expect(r.status).toBe(201);
    await expectShape(ReadarrCommandRecord, r, 'POST /api/readarr/v1/command 201');
    const body = (await r.json()) as { id: number; status: string; message: string };
    expect(body.status).toBe('queued');
    expect(body.message).toBe('missing_search');
    expect(body.id).toBeGreaterThan(0);
  });

  it('RefreshAuthor on a comic series enqueues comicvine_hydrate', async () => {
    const sid = await insertSeries({
      contentType: 'comic',
      comicvineId: 42,
      status: 'releasing',
      rootPath: '/media/comics/A',
      qualityProfileId: h.qpId,
      titleEnglish: 'A',
    });
    const r = await postCommand(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'RefreshAuthor', authorId: sid }),
      }),
    );
    expect(r.status).toBe(201);
    const body = (await r.json()) as { message: string };
    expect(body.message).toBe('comicvine_hydrate');
  });

  it('RescanFolders enqueues library_scan with no body', async () => {
    const r = await postCommand(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'RescanFolders' }),
      }),
    );
    expect(r.status).toBe(201);
    const body = (await r.json()) as { message: string };
    expect(body.message).toBe('library_scan');
  });

  it('Unknown command returns a synthetic completed (no-op)', async () => {
    const r = await postCommand(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'NoSuchThing' }),
      }),
    );
    expect(r.status).toBe(201);
    const body = (await r.json()) as { status: string };
    expect(body.status).toBe('completed');
  });

  it('RefreshAuthor without authorId is a no-op', async () => {
    const r = await postCommand(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'RefreshAuthor' }),
      }),
    );
    expect(r.status).toBe(201);
    const body = (await r.json()) as { status: string };
    expect(body.status).toBe('completed');
  });
});

describe('GET /api/readarr/v1/command/{id}', () => {
  it('returns the command status for an existing job id', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLbar',
      status: 'releasing',
      rootPath: '/media/books/B',
      qualityProfileId: h.qpId,
      titleEnglish: 'B',
    });
    const post = await postCommand(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'AuthorSearch', authorId: sid }),
      }),
    );
    const { id } = (await post.json()) as { id: number };
    const r = await getCommandById(new Request('http://x'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(r.status).toBe(200);
    await expectShape(ReadarrCommandRecord, r, 'GET /api/readarr/v1/command/{id} 200');
    const body = (await r.json()) as { id: number; status: string; name: string };
    expect(body.id).toBe(id);
    expect(body.name).toBe('missing_search');
    expect(body.status).toBe('queued');
  });

  it('returns 404 for unknown id', async () => {
    const r = await getCommandById(new Request('http://x'), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(r.status).toBe(404);
    await expectShape(ReadarrErrorResponse, r, 'GET /api/readarr/v1/command/{id} 404');
  });

  it('returns 400 for non-numeric id', async () => {
    const r = await getCommandById(new Request('http://x'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(r.status).toBe(400);
    await expectShape(ReadarrErrorResponse, r, 'GET /api/readarr/v1/command/{id} 400');
  });
});

describe('GET /api/readarr/v1/command', () => {
  it('returns recent jobs as command records', async () => {
    const sid = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OLbaz',
      status: 'releasing',
      rootPath: '/media/books/C',
      qualityProfileId: h.qpId,
      titleEnglish: 'C',
    });
    await postCommand(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'AuthorSearch', authorId: sid }),
      }),
    );
    const r = await getCommandList();
    expect(r.status).toBe(200);
    await expectShape(z.array(ReadarrCommandRecord), r, 'GET /api/readarr/v1/command');
    const body = (await r.json()) as Array<{ name: string; status: string }>;
    expect(body.length).toBeGreaterThanOrEqual(1);
    const ours = body.find((c) => c.name === 'missing_search');
    expect(ours).toBeDefined();
  });
});
