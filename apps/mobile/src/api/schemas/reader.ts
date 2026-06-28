import { z } from 'zod';

/**
 * Reader contracts, mirrored locally from the server's `packages/types/src/reader.ts`.
 *
 * Per mobile convention (see the other `src/api/schemas/*` files) we do NOT
 * import the shared package type here — the mobile app validates server
 * responses with its own local zod schemas so the wire contract is pinned at
 * the boundary. Keep these in sync with the server's reader contract.
 *
 * NOTE: the reader manifest's `contentType` carries the SERVER (DB) enum
 * (`manga|comic|light_novel|ebook|audiobook`), which differs from the mobile
 * `ContentType` schema (`manga|comic|novel|ebook|audio`). Callers map to the
 * mobile pill type where displayed (`light_novel→novel`, `audiobook→audio`).
 */

/** A parsed readableKey: a paged file (`page:file:<id>`) or audio volume (`audio:vol:<id>`). */
export type ReadableKeyParsed =
  | { kind: 'page'; fileId: number }
  | { kind: 'audio'; volumeId: number };

/** Serialize a parsed readableKey into its string form. */
export function buildReadableKey(p: ReadableKeyParsed): string {
  return p.kind === 'page' ? `page:file:${p.fileId}` : `audio:vol:${p.volumeId}`;
}

const PAGE_KEY_RE = /^page:file:(\d+)$/;
const AUDIO_KEY_RE = /^audio:vol:(\d+)$/;

/** Parse a readableKey string, throwing on malformed input. */
export function parseReadableKey(s: string): ReadableKeyParsed {
  const page = PAGE_KEY_RE.exec(s);
  if (page) return { kind: 'page', fileId: Number(page[1]) };
  const audio = AUDIO_KEY_RE.exec(s);
  if (audio) return { kind: 'audio', volumeId: Number(audio[1]) };
  throw new Error('invalid readableKey: ' + s);
}

/** Which player renders a readable. */
export const ReaderKind = z.enum(['text', 'comics', 'audio']);
export type ReaderKind = z.infer<typeof ReaderKind>;

/** Source container/format of a readable. */
export const ReaderFormat = z.enum([
  'epub',
  'pdf',
  'cbz',
  'cbr',
  'zip',
  'rar',
  '7z',
  'audio',
  // foliate-js renders Mobipocket / KF8 client-side (no server spine/toc).
  'mobi',
  'azw3',
]);
export type ReaderFormat = z.infer<typeof ReaderFormat>;

/** The content types the server reader manifest reports (DB enum). */
export const ReaderContentType = z.enum(['manga', 'comic', 'light_novel', 'ebook', 'audiobook']);
export type ReaderContentType = z.infer<typeof ReaderContentType>;

/**
 * A resume locator. EPUBs use spine index + page within the item; paged formats
 * use a page number; audio uses seconds; foliate-rendered formats (mobi/azw3)
 * use a 0..1 reading fraction (`view.goToFraction`). Null when no precise
 * location is known.
 */
export const ReaderLocator = z
  .union([
    z.object({ spineIdx: z.number(), pageInItem: z.number() }),
    z.object({ page: z.number() }),
    z.object({ sec: z.number() }),
    z.object({ frac: z.number() }),
  ])
  .nullable();
export type ReaderLocator = z.infer<typeof ReaderLocator>;

/** Persisted reading progress for a single readable. */
export const ReaderProgress = z.object({
  readableKey: z.string(),
  position: z.number(),
  locator: ReaderLocator,
  finished: z.boolean(),
  restartedFromFinish: z.boolean(),
});
export type ReaderProgress = z.infer<typeof ReaderProgress>;

/** One entry in an EPUB-style spine. */
export const SpineItem = z.object({
  idx: z.number(),
  href: z.string(),
  id: z.string().optional(),
  mediaType: z.string().optional(),
});
export type SpineItem = z.infer<typeof SpineItem>;

/** One table-of-contents entry. */
export const TocEntry = z.object({
  label: z.string(),
  href: z.string(),
  spineIdx: z.number().optional(),
});
export type TocEntry = z.infer<typeof TocEntry>;

/** One audio track within a multi-file audio volume. */
export const AudioTrack = z.object({
  idx: z.number(),
  fileId: z.number(),
  durationSec: z.number().nullable(),
  title: z.string().optional(),
});
export type AudioTrack = z.infer<typeof AudioTrack>;

/** A chapter marker, addressed by time (audio) or page (paged). */
export const ChapterMark = z.object({
  title: z.string(),
  startSec: z.number().optional(),
  startPage: z.number().optional(),
});
export type ChapterMark = z.infer<typeof ChapterMark>;

/** Everything a player needs to render and resume a readable. */
export const ReaderManifest = z.object({
  readableKey: z.string(),
  contentType: ReaderContentType,
  reader: ReaderKind,
  format: ReaderFormat,
  title: z.string(),
  author: z.string().nullable().optional(),
  seriesId: z.number(),
  volumeId: z.number().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  volumeLabel: z.string().nullable().optional(),
  pageCount: z.number().optional(),
  opfDir: z.string().optional(),
  spine: z.array(SpineItem).optional(),
  toc: z.array(TocEntry).optional(),
  tracks: z.array(AudioTrack).optional(),
  chapters: z.array(ChapterMark).optional(),
  totalSec: z.number().nullable().optional(),
  /**
   * For EPUBs: a short-lived, HMAC-signed token scoped to this `{fileId,
   * userId}`. Appended as `?token=` on the EPUB resource route so sub-resources
   * (CSS / <img> / fonts) authenticate without leaking the long-lived account
   * bearer into URLs. Absent for non-EPUB formats and from older servers.
   */
  epubResourceToken: z.string().optional(),
  progress: ReaderProgress,
});
export type ReaderManifest = z.infer<typeof ReaderManifest>;

/**
 * The PUT body the progress route validates. `restartedFromFinish` is server-
 * derived and not sent; `finished` is derived from `position` server-side too.
 * `deviceId` and `deviceName` are optional (DS11f) for per-device tracking.
 */
export const ProgressPutBody = z.object({
  position: z.number(),
  locator: ReaderLocator,
  seriesId: z.number(),
  volumeId: z.number().nullable(),
  libraryFileId: z.number().nullable(),
  contentType: ReaderContentType,
  /** Per-device stable UUID. Optional for backward compat. */
  deviceId: z.string().nullable().optional(),
  /** Human-readable device label, e.g. "your iPhone". Optional. */
  deviceName: z.string().nullable().optional(),
});
export type ProgressPutBody = z.infer<typeof ProgressPutBody>;

/**
 * One Continue-Reading row. Mirrors the server `ContinueReadingRow`
 * (a persisted progress row joined with series title/cover). Timestamps and
 * the raw `locatorJson` string are passed through as the server serializes them.
 */
export const ContinueReadingItem = z.object({
  id: z.number(),
  readableKey: z.string(),
  seriesId: z.number(),
  volumeId: z.number().nullable(),
  libraryFileId: z.number().nullable(),
  contentType: ReaderContentType,
  position: z.number(),
  locatorJson: z.string(),
  finished: z.boolean(),
  updatedAt: z.union([z.number(), z.string()]),
  title: z.string().nullable(),
  coverUrl: z.string().nullable(),
});
export type ContinueReadingItem = z.infer<typeof ContinueReadingItem>;

/** The Continue-Reading list response. */
export const ContinueReadingResponse = z.object({
  items: z.array(ContinueReadingItem),
});
export type ContinueReadingResponse = z.infer<typeof ContinueReadingResponse>;
