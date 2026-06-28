import { z } from 'zod';
import { defineSetting } from '../settings';

/** Optional Google Books API key. Empty string = keyless (low quota). */
export const googleBooksApiKeySetting = defineSetting('googlebooks.api_key', z.string(), '');

/** Returns the key, or null when not configured (keyless mode). */
export function googleBooksApiKeyOrNull(k: string): string | null {
  return k.length > 0 ? k : null;
}
