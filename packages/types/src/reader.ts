import { z } from 'zod';

/**
 * Shared reader contracts: the manifest the player UI consumes, the progress
 * record persisted per readable, and the `readableKey` helpers that address a
 * readable thing (a paged file or an audio volume).
 *
 * This file is RN-safe: it depends only on zod, never on Node built-ins, so
 * both the web app and the React Native app can import it.
 */

/**
 * A parsed readableKey. Either a paged file (`page:file:<id>`) or an audio
 * volume (`audio:vol:<id>`).
 */
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
  if (page) {
    return { kind: 'page', fileId: Number(page[1]) };
  }
  const audio = AUDIO_KEY_RE.exec(s);
  if (audio) {
    return { kind: 'audio', volumeId: Number(audio[1]) };
  }
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
  'mobi',
  'azw3',
]);
export type ReaderFormat = z.infer<typeof ReaderFormat>;

/**
 * A resume locator. EPUBs use spine index + page within the item; paged
 * formats use a page number; audio uses seconds; foliate-rendered formats
 * (mobi/azw3) use a 0..1 reading fraction (`view.goToFraction`). Null when no
 * precise location is known.
 */
export const LocatorSchema = z
  .union([
    z.object({ spineIdx: z.number(), pageInItem: z.number() }),
    z.object({ page: z.number() }),
    z.object({ sec: z.number() }),
    z.object({ frac: z.number() }),
  ])
  .nullable();
export type ReaderLocator = z.infer<typeof LocatorSchema>;

/** Persisted reading progress for a single readable. */
export const ReaderProgressSchema = z.object({
  readableKey: z.string(),
  position: z.number(),
  locator: LocatorSchema,
  finished: z.boolean(),
  restartedFromFinish: z.boolean(),
});
export type ReaderProgress = z.infer<typeof ReaderProgressSchema>;

/** One entry in an EPUB-style spine. */
export const SpineItemSchema = z.object({
  idx: z.number(),
  href: z.string(),
  id: z.string().optional(),
  mediaType: z.string().optional(),
});
export type SpineItem = z.infer<typeof SpineItemSchema>;

/** One table-of-contents entry. */
export const TocEntrySchema = z.object({
  label: z.string(),
  href: z.string(),
  /** EPUB target: the resolved spine index this entry jumps to. */
  spineIdx: z.number().optional(),
  /** PDF target: the 1-based page number this entry jumps to. */
  page: z.number().optional(),
});
export type TocEntry = z.infer<typeof TocEntrySchema>;

/** One audio track within a multi-file audio volume. */
export const AudioTrackSchema = z.object({
  idx: z.number(),
  fileId: z.number(),
  durationSec: z.number().nullable(),
  title: z.string().optional(),
});
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

/** A chapter marker, addressed by time (audio) or page (paged). */
export const ChapterMarkSchema = z.object({
  title: z.string(),
  startSec: z.number().optional(),
  startPage: z.number().optional(),
});
export type ChapterMark = z.infer<typeof ChapterMarkSchema>;

/** Everything a player needs to render and resume a readable. */
export const ReaderManifestSchema = z.object({
  readableKey: z.string(),
  contentType: z.string(),
  reader: ReaderKind,
  format: ReaderFormat,
  title: z.string(),
  author: z.string().nullable().optional(),
  seriesId: z.number(),
  volumeId: z.number().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  volumeLabel: z.string().nullable().optional(),
  pageCount: z.number().optional(),
  /**
   * For EPUBs: the directory the OPF lives in (e.g. `OEBPS`). Spine/TOC hrefs
   * are OPF-relative; the player joins this with each href to address the zip
   * entry the resource route serves. Empty string when the OPF is at the root.
   */
  opfDir: z.string().optional(),
  spine: z.array(SpineItemSchema).optional(),
  toc: z.array(TocEntrySchema).optional(),
  tracks: z.array(AudioTrackSchema).optional(),
  chapters: z.array(ChapterMarkSchema).optional(),
  totalSec: z.number().nullable().optional(),
  /**
   * For EPUBs: a short-lived, HMAC-signed token scoped to this `{fileId,
   * userId}`. The RN reader appends it as `?token=` on the EPUB resource route
   * so sub-resources (CSS / <img> / fonts) authenticate without leaking the
   * long-lived account bearer into URLs. Absent for non-EPUB formats and from
   * older servers (the reader degrades gracefully).
   */
  epubResourceToken: z.string().optional(),
  progress: ReaderProgressSchema,
});
export type ReaderManifest = z.infer<typeof ReaderManifestSchema>;
