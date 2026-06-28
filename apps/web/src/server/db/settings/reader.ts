import { z } from 'zod';
import { defineSetting } from '../settings';

/**
 * Reader-scoped persistent settings. Currently just the HMAC secret used to
 * sign short-lived EPUB sub-resource `?token=` values (see
 * `@/server/reader/epub-token`). The secret is 32 random bytes, stored
 * base64url, and minted lazily on first use.
 */
export const ReaderSecretSchema = z.object({
  /** base64url-encoded 32-byte HMAC secret, or null until first minted. */
  epubTokenSecret: z.string().nullable(),
});

export type ReaderSecretConfig = z.infer<typeof ReaderSecretSchema>;

const DEFAULT: ReaderSecretConfig = { epubTokenSecret: null };

export const readerSecretSetting = defineSetting(
  'reader.epub_token_secret',
  ReaderSecretSchema,
  DEFAULT,
);
