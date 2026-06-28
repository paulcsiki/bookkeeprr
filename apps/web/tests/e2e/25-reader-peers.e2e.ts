import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';
import { seedReaderFixtures, type ReaderSeed } from './helpers/reader-seed';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

let seed: ReaderSeed;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();

  seed = seedReaderFixtures();
});

test.describe('Reader peers API', () => {
  test('GET /api/reader/progress/[readableKey]/peers returns empty list when only self has progress', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const readableKey = `page:file:${seed.comic.fileId}`;
    const encodedKey = encodeURIComponent(readableKey);
    const selfDeviceId = 'self-device-test-001';

    // PUT progress for the self device.
    const putRes = await page.request.put(`/api/reader/progress/${encodedKey}`, {
      data: {
        position: 0.3,
        locator: { page: 3 },
        seriesId: seed.comic.seriesId,
        volumeId: seed.comic.volumeId,
        libraryFileId: seed.comic.fileId,
        contentType: 'comic',
        deviceId: selfDeviceId,
        deviceName: 'Test Device Self',
      },
    });
    expect(putRes.ok(), `PUT progress failed: ${await putRes.text()}`).toBe(true);

    // GET peers for the same readable, excluding self — expect empty list.
    const peersRes = await page.request.get(
      `/api/reader/progress/${encodedKey}/peers?selfDeviceId=${selfDeviceId}`,
    );
    expect(peersRes.ok(), `GET peers failed: ${await peersRes.text()}`).toBe(true);

    const peersBody = (await peersRes.json()) as {
      peers: Array<{
        deviceId: string;
        deviceName: string | null;
        position: number;
        updatedAt: string;
      }>;
    };
    expect(Array.isArray(peersBody.peers), 'peers should be an array').toBe(true);
    expect(peersBody.peers).toHaveLength(0);
  });

  test('GET /api/reader/progress/[readableKey]/peers returns other devices after second PUT', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const readableKey = `page:file:${seed.comic.fileId}`;
    const encodedKey = encodeURIComponent(readableKey);
    const selfDeviceId = 'self-device-test-002';
    const otherDeviceId = 'other-device-test-002';

    // PUT progress for the self device.
    const putSelf = await page.request.put(`/api/reader/progress/${encodedKey}`, {
      data: {
        position: 0.3,
        locator: { page: 3 },
        seriesId: seed.comic.seriesId,
        volumeId: seed.comic.volumeId,
        libraryFileId: seed.comic.fileId,
        contentType: 'comic',
        deviceId: selfDeviceId,
        deviceName: 'Test Device Self 2',
      },
    });
    expect(putSelf.ok(), `PUT self progress failed: ${await putSelf.text()}`).toBe(true);

    // PUT progress for a second device.
    const putOther = await page.request.put(`/api/reader/progress/${encodedKey}`, {
      data: {
        position: 0.7,
        locator: { page: 7 },
        seriesId: seed.comic.seriesId,
        volumeId: seed.comic.volumeId,
        libraryFileId: seed.comic.fileId,
        contentType: 'comic',
        deviceId: otherDeviceId,
        deviceName: 'Other Test Device',
      },
    });
    expect(putOther.ok(), `PUT other progress failed: ${await putOther.text()}`).toBe(true);

    // GET peers from self's perspective — should see exactly 1 peer (the other device).
    const peersRes = await page.request.get(
      `/api/reader/progress/${encodedKey}/peers?selfDeviceId=${selfDeviceId}`,
    );
    expect(peersRes.ok(), `GET peers failed: ${await peersRes.text()}`).toBe(true);

    const peersBody = (await peersRes.json()) as {
      peers: Array<{
        deviceId: string;
        deviceName: string | null;
        position: number;
        updatedAt: string;
      }>;
    };
    expect(Array.isArray(peersBody.peers), 'peers should be an array').toBe(true);
    // At least one peer should be the other device (may be more from earlier tests).
    const otherPeer = peersBody.peers.find((p) => p.deviceId === otherDeviceId);
    expect(otherPeer, 'expected the other device in peers list').toBeDefined();
    expect(otherPeer!.position).toBe(0.7);
    expect(typeof otherPeer!.updatedAt).toBe('string');

    // Self device must NOT appear in the peers list.
    const selfPeer = peersBody.peers.find((p) => p.deviceId === selfDeviceId);
    expect(selfPeer, 'self device must not appear in peers list').toBeUndefined();
  });

  test('GET /api/reader/progress/[readableKey]/peers returns 400 when selfDeviceId is missing', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const readableKey = `page:file:${seed.comic.fileId}`;
    const encodedKey = encodeURIComponent(readableKey);

    // Missing selfDeviceId — expect 400.
    const peersRes = await page.request.get(`/api/reader/progress/${encodedKey}/peers`);
    expect(peersRes.status(), 'expected 400 when selfDeviceId is absent').toBe(400);
  });
});
