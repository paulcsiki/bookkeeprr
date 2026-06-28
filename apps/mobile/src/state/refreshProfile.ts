// Side-effecting profile refresh (NOT a hook, so App.tsx can call it
// imperatively post-login / on foreground). Fetches /api/mobile/me, caches the
// identity in the profile store, and resolves the avatar to a LOCAL file so the
// Home greeting renders offline with no network at paint time:
//   server avatar route → else Gravatar(email) (MD5, d=404) → else null.
// Skipped offline (the cached copy stands). Best-effort: a failed avatar
// download leaves the prior cached image intact. The avatar fetch is injectable
// so tests exercise this without the native blob-util module. `now`/`fetchAvatar`
// are the only injection seams; identity timestamps live here (never a reducer).

import { md5 } from 'js-md5';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { createApiClient } from '@/api/client';
import { MeResponse } from '@/api/schemas';
import type { Credentials } from '@/auth/token-store';
import { isOnlineNow } from '@/state/connectivityStore';
import { useProfile } from '@/state/profileStore';
import { toRelative } from '@/features/reader/lib/offline-download';

const fs = ReactNativeBlobUtil.fs;

/** Where the cached avatar lives on disk. */
function avatarSavePath(): string {
  return `${fs.dirs.DocumentDir}/profile/avatar`;
}

/** Injectable file fetch (url + headers → save path). Defaults to rnbu. */
export type AvatarFetch = (url: string, headers: Record<string, string>, savePath: string) => Promise<string>;

/**
 * Native timeout (ms) for the avatar fetch. Without it, a hung connection never
 * resolves → `setAvatar` is never called and the greeting is stuck on initials
 * forever. rnbu's native `timeout` rejects the fetch so the best-effort path
 * falls through (the prior cache stands, and a later refresh retries).
 */
const AVATAR_TIMEOUT_MS = 15_000;

const rnbuAvatarFetch: AvatarFetch = async (url, headers, savePath) => {
  const res = await ReactNativeBlobUtil.config({ path: savePath, timeout: AVATAR_TIMEOUT_MS }).fetch('GET', url, headers);
  const status = res.info().status;
  if (status < 200 || status >= 300) throw new Error(`avatar fetch failed: ${status}`);
  return res.path() || savePath;
};

/** Gravatar URL for an email — MD5, d=404 (matches the web @bookkeeprr/ui Avatar). */
function gravatarUrl(email: string): string {
  return `https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?d=404&s=160`;
}

interface RefreshDeps {
  now?: () => number;
  fetchAvatar?: AvatarFetch;
}

/**
 * Fetch /api/mobile/me, cache the identity, and resolve the avatar to a LOCAL
 * file so the greeting renders offline with no network at paint time. Skipped
 * offline (the cached copy stands). Best-effort: a failed avatar download leaves
 * the prior cached image intact. `now`/`fetchAvatar` are injectable for tests.
 */
export async function refreshProfile(creds: Credentials, deps: RefreshDeps = {}): Promise<void> {
  if (!isOnlineNow()) return; // offline — cached copy stands
  const now = deps.now ?? (() => Date.now());
  const fetchAvatar = deps.fetchAvatar ?? rnbuAvatarFetch;

  let me: MeResponse;
  try {
    const client = createApiClient(creds, { onAuthFail: () => {} });
    me = MeResponse.parse(await client.get('/api/mobile/me'));
  } catch {
    return; // transient — keep the cache
  }

  useProfile.getState().setIdentity(
    { id: me.id, username: me.username, displayName: me.displayName, email: me.email, avatarUrl: me.avatarUrl ?? null },
    now(),
  );

  // Resolve the avatar to disk: server route → else Gravatar(email) → else null.
  const headers = { Authorization: `Bearer ${creds.token}` };
  const base = creds.serverUrl.replace(/\/$/, '');
  const url = me.avatarUrl
    ? `${base}${me.avatarUrl}`
    : me.email
      ? gravatarUrl(me.email)
      : null;
  if (url === null) {
    // No server avatar and no email → no image; keep the prior cache as-is.
    return;
  }
  await fs.mkdir(`${fs.dirs.DocumentDir}/profile`).catch(() => undefined);

  // Always re-download the avatar when online and the throttle allows a refresh.
  // The server avatar route URL is stable even when the image bytes change, so
  // there is no URL/etag signal to detect a changed avatar — always re-fetching
  // is the only way to stay fresh. This also subsumes any self-heal for a
  // missing/stale local file (e.g. after an iOS container UUID rotation): the
  // file is simply re-downloaded on the next refresh.
  // Offline rendering is handled by Avatar.tsx via resolveOffline(avatarLocalPath).
  try {
    // Gravatar 404 (d=404) and the unauth server route both throw → caught here.
    const path = await fetchAvatar(url, me.avatarUrl ? headers : {}, avatarSavePath());
    // Store a RELATIVE path (relative to DocumentDir) so the cached avatar
    // survives iOS app-container UUID rotation on app updates. Avatar.tsx uses
    // resolveOffline() to turn the relative path back into a live absolute URI.
    useProfile.getState().setAvatar(toRelative(path));
  } catch {
    /* best-effort: leave the prior cached image intact */
  }
}
