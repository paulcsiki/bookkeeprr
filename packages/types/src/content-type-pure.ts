/**
 * Pure (no-zod) content-type constants and helpers.
 *
 * This file intentionally has zero dependencies so it can be imported by
 * Node CLI scripts (esbuild standalone bundles) and server DB modules that
 * must not pull in zod.
 *
 * @bookkeeprr/types re-exports everything here plus the zod schema.
 */

export const CONTENT_TYPES = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(x: unknown): x is ContentType {
  return typeof x === 'string' && (CONTENT_TYPES as readonly string[]).includes(x);
}

export function assertContentType(x: unknown): asserts x is ContentType {
  if (!isContentType(x)) {
    throw new Error(`invalid content type: ${String(x)}`);
  }
}
