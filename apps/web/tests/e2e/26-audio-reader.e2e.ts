import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';
import { seedReaderFixtures, type ReaderSeed } from './helpers/reader-seed';

test.describe.configure({ timeout: 180_000 });

let seed: ReaderSeed;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  // Create admin + initialise DB (the reader seed depends on the default
  // quality profile that first-run inserts).
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, { username: 'admin', password: 'hunter22' });
  await ctx.close();

  seed = seedReaderFixtures();
});

test.describe('Audio reader', () => {
  test('audio reader page renders the player and saves progress via API', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    await page.goto(`/read/f/${seed.audio.fileId}`);

    // The AudioReader wraps everything in a ReaderRoot with data-testid="reader-audio".
    const root = page.getByTestId('reader-audio');
    await expect(root).toBeVisible({ timeout: 15_000 });

    // Play/Pause button is the core transport control.
    const playBtn = root.getByRole('button', { name: /^Play$|^Pause$/i });
    await expect(playBtn).toBeVisible();

    // Playback speed button (cycles through 0.8× / 1× / 1.2× …).
    const speedBtn = root.getByRole('button', { name: /Playback speed/i });
    await expect(speedBtn).toBeVisible();

    // Sleep timer button.
    const sleepBtn = root.getByRole('button', { name: /Sleep timer/i });
    await expect(sleepBtn).toBeVisible();

    // Save progress via the reader progress API. Audio readables are addressed
    // by volume (audio:vol:<volumeId>), not by file — see parseReadableKey in
    // packages/types/src/reader.ts.
    const key = `audio:vol:${seed.audio.volumeId}`;
    const putRes = await page.request.put(`/api/reader/progress/${encodeURIComponent(key)}`, {
      data: {
        position: 0.25,
        locator: { sec: 60 },
        seriesId: seed.audio.seriesId,
        volumeId: seed.audio.volumeId,
        libraryFileId: seed.audio.fileId,
        contentType: 'audiobook',
      },
    });
    expect(putRes.ok(), await putRes.text()).toBe(true);

    // Confirm GET round-trips the saved position.
    const getRes = await page.request.get(`/api/reader/progress/${encodeURIComponent(key)}`);
    expect(getRes.ok()).toBe(true);
    const prog = (await getRes.json()) as { position: number };
    expect(prog.position).toBeCloseTo(0.25, 2);
  });
});
