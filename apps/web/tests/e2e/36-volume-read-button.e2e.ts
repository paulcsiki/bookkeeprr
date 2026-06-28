/**
 * Volume Read button e2e (Spec 36).
 *
 * The series-detail Volumes tab renders a per-volume "Read" button ONLY for
 * volumes that own a library file (VolumesTab.tsx gates the action row on the
 * file lookup). Clicking it navigates to /read/v/<volumeId>, where the generic
 * <Reader> resolves the volume's manifest and mounts the matching surface —
 * for the seeded CBZ that's the comics reader (data-testid="reader-comics").
 *
 * Seeding reuses the reader fixtures (helpers/reader-seed.ts): a comic series
 * with volume 1 backed by a real sample.cbz in /media. An extra, unowned
 * volume 2 is added via the admin volumes endpoint to prove the negative case.
 */

import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';
import { seedReaderFixtures, type ReaderSeed } from './helpers/reader-seed';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

let seed: ReaderSeed;
let unownedVolumeId: number;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  // First-run admin initialises the DB + a default quality profile, which the
  // raw-SQL reader seed depends on. Do it before seeding.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);

  seed = seedReaderFixtures();

  // Add an unowned volume 2 to the comic series (no library file attached).
  await signIn(page, ADMIN.username, ADMIN.password);
  const created = await page.request.post(`/api/series/${seed.comic.seriesId}/volumes`, {
    data: { from: 2, to: 2 },
  });
  expect(created.status(), await created.text()).toBe(201);

  // Resolve volume 2's id from the volumes list.
  const list = await page.request.get(`/api/series/${seed.comic.seriesId}/volumes`);
  expect(list.ok(), await list.text()).toBe(true);
  const body = (await list.json()) as { volumes: Array<{ id: number; number: number }> };
  const vol2 = body.volumes.find((v) => v.number === 2);
  expect(vol2, 'volume 2 should exist after the bulk-create').toBeDefined();
  unownedVolumeId = vol2!.id;

  await ctx.close();
});

test.describe('Volume Read button', () => {
  test('Volumes tab shows Read only for the owned volume; click opens /read/v/<id>', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto(`/library/${seed.comic.seriesId}`);

    await expect(page.getByRole('heading', { name: /Seed Comic/i })).toBeVisible();

    // Open the Volumes tab (label carries the count, e.g. "Volumes (2)").
    await page.getByRole('tab', { name: /^Volumes/ }).click();

    // The owned volume's card links to /read/v/<volumeId>. Use exact: true so
    // the header's "Read now" CTA (same href) doesn't match.
    const readLink = page.getByRole('link', { name: 'Read', exact: true });
    await expect(readLink).toHaveCount(1);
    await expect(readLink).toHaveAttribute('href', `/read/v/${seed.comic.volumeId}`);

    // The unowned volume gets no Read button — nothing links to its reader URL.
    await expect(page.locator(`a[href="/read/v/${unownedVolumeId}"]`)).toHaveCount(0);

    // Click Read → the volume-addressed reader route.
    await readLink.click();
    await expect(page).toHaveURL(`/read/v/${seed.comic.volumeId}`);

    // The reader shell mounts: the CBZ volume resolves to the comics surface.
    await expect(page.getByTestId('reader-comics')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByAltText('Page 1')).toBeVisible();
  });
});
