import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { listJobsByKind } from '@/server/db/jobs';
import { createGroup } from '@/server/db/library-groups';
import { POST } from '@/app/api/scan/route';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { JobConflictResponse, JobEnqueuedResponse } from '@/server/openapi/schemas/jobs';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

function req(body: unknown): Request {
  return new Request('http://x/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/scan', () => {
  it('202 with jobId for a readable root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-enq-'));
    try {
      const res = await POST(req({ rootPath: root }));
      expect(res.status).toBe(202);
      await expectShape(JobEnqueuedResponse, res, 'POST /api/scan');
      const json = (await res.json()) as { jobId: number };
      expect(typeof json.jobId).toBe('number');
      const jobs = await listJobsByKind('library_scan');
      expect(jobs.some((j) => j.id === json.jobId)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('400 when rootPath is missing', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/scan');
  });

  it('400 when rootPath does not exist or is unreadable', async () => {
    const res = await POST(req({ rootPath: '/this/does/not/exist/at/all' }));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/scan');
  });

  it('202 accepts targetGroupId + structure and forwards them in the job payload', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-enq-'));
    try {
      const group = await createGroup('Backlog', null);
      const res = await POST(req({ rootPath: root, targetGroupId: group.id, structure: 'mirror' }));
      expect(res.status).toBe(202);
      await expectShape(JobEnqueuedResponse, res, 'POST /api/scan');
      const json = (await res.json()) as { jobId: number };
      const job = (await listJobsByKind('library_scan')).find((j) => j.id === json.jobId);
      const payload = JSON.parse(job!.payloadJson!) as {
        rootPath: string;
        targetGroupId?: number;
        structure?: string;
      };
      expect(payload.rootPath).toBe(root);
      expect(payload.targetGroupId).toBe(group.id);
      expect(payload.structure).toBe('mirror');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('422 when targetGroupId does not exist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-enq-'));
    try {
      const res = await POST(req({ rootPath: root, targetGroupId: 999_999 }));
      expect(res.status).toBe(422);
      await expectShape(ErrorResponse, res, 'POST /api/scan');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('400 when structure is not flat|mirror', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-enq-'));
    try {
      const res = await POST(req({ rootPath: root, structure: 'tree' }));
      expect(res.status).toBe(400);
      await expectShape(ErrorResponse, res, 'POST /api/scan');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('409 when a library_scan job is already pending or running', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-enq-'));
    try {
      const first = await POST(req({ rootPath: root }));
      expect(first.status).toBe(202);
      const second = await POST(req({ rootPath: root }));
      expect(second.status).toBe(409);
      await expectShape(JobConflictResponse, second, 'POST /api/scan');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
