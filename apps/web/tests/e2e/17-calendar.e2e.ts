import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();
});

test.describe('Calendar page', () => {
  test('/calendar page renders the month grid', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/calendar');

    // The CalendarPage renders a PageHeader with title="Calendar".
    await expect(page.getByRole('heading', { name: /^Calendar$/i })).toBeVisible();

    // The MonthGrid renders a DOW bar with Sun/Mon/Tue/Wed/Thu/Fri/Sat abbreviations.
    // DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] in calendar/lib.ts.
    await expect(page.getByText(/^Mon$/i).first()).toBeVisible();
    await expect(page.getByText(/^Sun$/i).first()).toBeVisible();

    // The month heading (e.g. "May 2026") is rendered in the grid header as an h2.
    // Use a tolerant regex: any 4-digit year preceded by a month name.
    await expect(
      page.getByRole('heading', { name: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b.+\d{4}/i }),
    ).toBeVisible();
  });
});
