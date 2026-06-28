// AsyncStorage-backed list of the last 5 server URLs successfully connected to.
// Entries are stored most-recent-first. URLs are deduplicated by lowercased
// protocol+host so that https://Server.example and https://server.example are
// treated as the same entry.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'onboarding/recent-server-urls/v1';
const MAX_ENTRIES = 5;

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    // Lowercase the protocol and host; preserve path/params as-is.
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Returns up to 5 recent server URLs, most-recent first. */
export async function loadRecentUrls(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Prepends `url` to the recent list (after deduplication + normalization) and
 * persists. Keeps at most `MAX_ENTRIES` entries.
 */
export async function addRecentUrl(url: string): Promise<void> {
  const normalized = normalizeUrl(url);
  const current = await loadRecentUrls();
  // Remove any existing entry with the same normalized URL.
  const deduped = current.filter((u) => normalizeUrl(u) !== normalized);
  // Prepend the new URL (use the original casing) and cap to MAX_ENTRIES.
  const next = [url, ...deduped].slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

/** Clears all stored recent URLs. */
export async function clearRecentUrls(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
