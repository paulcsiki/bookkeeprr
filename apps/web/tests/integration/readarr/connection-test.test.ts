import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import {
  ReadarrCommandRecord,
  ReadarrHealthResponse,
  ReadarrMetadataProfile,
  ReadarrQualityProfile,
  ReadarrQueueResponse,
  ReadarrRootFolder,
  ReadarrSystemStatusResponse,
} from '@/server/openapi/schemas/readarr';
import { GET as statusGET } from '@/app/api/readarr/v1/system/status/route';
import { GET as qpGET } from '@/app/api/readarr/v1/qualityprofile/route';
import { GET as mpGET } from '@/app/api/readarr/v1/metadataprofile/route';
import { GET as rfGET } from '@/app/api/readarr/v1/rootfolder/route';
import { GET as cmdGET, POST as cmdPOST } from '@/app/api/readarr/v1/command/route';
import { GET as queueGET } from '@/app/api/readarr/v1/queue/route';
import { GET as healthGET } from '@/app/api/readarr/v1/health/route';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('Readarr v1 — connection-test endpoints', () => {
  it('GET /system/status returns version + appName', async () => {
    const r = await statusGET();
    expect(r.status).toBe(200);
    await expectShape(ReadarrSystemStatusResponse, r, 'GET /api/readarr/v1/system/status 200');
    const body = await r.json();
    expect(body.appName).toBe('bookkeeprr');
    expect(typeof body.version).toBe('string');
  });

  it('GET /qualityprofile returns the seeded profile in Readarr shape', async () => {
    const r = await qpGET();
    expect(r.status).toBe(200);
    await expectShape(z.array(ReadarrQualityProfile), r, 'GET /api/readarr/v1/qualityprofile 200');
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
  });

  it('GET /metadataprofile returns five profiles (ebook/audiobook/light_novel/manga/comic)', async () => {
    const r = await mpGET();
    expect(r.status).toBe(200);
    await expectShape(
      z.array(ReadarrMetadataProfile),
      r,
      'GET /api/readarr/v1/metadataprofile 200',
    );
    const body = await r.json();
    expect(body).toHaveLength(5);
    expect(body.map((p: { id: number }) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('GET /rootfolder lists per-type roots', async () => {
    const r = await rfGET();
    expect(r.status).toBe(200);
    await expectShape(z.array(ReadarrRootFolder), r, 'GET /api/readarr/v1/rootfolder 200');
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(3);
    for (const rf of body) {
      expect(rf).toMatchObject({ id: expect.any(Number), path: expect.any(String) });
    }
  });

  it('GET /command returns an array (may be empty)', async () => {
    const r = await cmdGET();
    expect(r.status).toBe(200);
    await expectShape(z.array(ReadarrCommandRecord), r, 'GET /api/readarr/v1/command 200');
    const body = (await r.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /command with no body returns 201', async () => {
    const r = await cmdPOST(
      new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' } }),
    );
    expect(r.status).toBe(201);
    await expectShape(ReadarrCommandRecord, r, 'POST /api/readarr/v1/command 201');
    const body = (await r.json()) as { status: string };
    // No name → no-op → completed
    expect(body.status).toBe('completed');
  });

  it('GET /queue returns records:[]', async () => {
    const r = await queueGET(new Request('http://x/api/readarr/v1/queue'));
    await expectShape(ReadarrQueueResponse, r, 'GET /api/readarr/v1/queue 200');
    const body = await r.json();
    expect(body.records).toEqual([]);
    expect(body.totalRecords).toBe(0);
    expect(body.page).toBe(1);
  });

  it('GET /health returns []', async () => {
    const r = await healthGET();
    await expectShape(ReadarrHealthResponse, r, 'GET /api/readarr/v1/health 200');
    const body = await r.json();
    expect(body).toEqual([]);
  });
});
