import type { Page } from '@playwright/test';

/** `<handle>@example.com` for a bare handle; pass through anything already an email. */
function asEmail(username: string): string {
  return username.includes('@') ? username : `${username}@example.com`;
}

// Login identifiers registered through the first-run wizard (which forces an
// email). Recorded so signIn can try the email form FIRST for the admin — the
// common case — instead of paying a failed-bare-login timeout on every call.
const wizardEmails = new Set<string>();

/**
 * The redesigned first-run wizard registers the admin by EMAIL (and stores the
 * email as the username). Secondary users created via `POST /api/users` keep
 * their plain username. So the login identifier differs by how the account was
 * made: the wizard admin signs in with `<handle>@example.com`, a `/api/users`
 * account with its bare username. `signIn` handles both — see below.
 */
export async function createFirstAdmin(
  page: Page,
  args: { username: string; password: string },
): Promise<void> {
  await page.goto('/first-run');
  // Step 0: the welcome screen — advance into the admin form.
  await page.getByRole('button', { name: /Begin setup/i }).click();
  // Step 1: ADMIN ACCOUNT — email + password + confirm.
  await page.locator('#admin-email').fill(asEmail(args.username));
  await page.locator('#admin-password').fill(args.password);
  await page.locator('#admin-confirm').fill(args.password);
  wizardEmails.add(asEmail(args.username));
  await page.getByRole('button', { name: /Create admin/i }).click();
  // The wizard advances to step 2 (STORAGE); the URL stays /first-run. Wait for
  // that step's eyebrow as the success signal.
  await page.getByText(/STEP 2 · STORAGE/i).waitFor({ timeout: 15_000 });
}

async function attemptLogin(page: Page, identifier: string, password: string): Promise<boolean> {
  // A stale authenticated page can client-redirect to /login the instant its
  // session is cleared (signOut), which aborts our explicit navigation with
  // ERR_ABORTED. Ignore that — the #username locator below waits for whichever
  // way we end up on /login.
  await page.goto('/login').catch(() => {});
  await page.locator('#username').fill(identifier);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 6_000 });
    return true;
  } catch {
    return false;
  }
}

export async function signIn(page: Page, username: string, password: string): Promise<void> {
  // The login identifier differs by how the account was made: a wizard admin
  // signs in by `<handle>@example.com`, a `/api/users` account by its bare
  // username. Order the candidates so the likely-correct one is tried first
  // (no wasted failed-login timeout), then fall back to the other form.
  const email = asEmail(username);
  const candidates = wizardEmails.has(email) ? [email, username] : [username, email];
  for (const id of [...new Set(candidates)]) {
    if (await attemptLogin(page, id, password)) return;
  }
  throw new Error(`signIn: could not authenticate "${username}" (tried ${candidates.join(', ')})`);
}

export async function signOut(page: Page): Promise<void> {
  // No UI logout button in M20 yet, and POSTing to /api/auth/logout via page.request
  // didn't propagate the Set-Cookie clear into the BrowserContext cookie jar
  // reliably. Clear cookies directly — simpler + deterministic.
  await page.context().clearCookies();
}
