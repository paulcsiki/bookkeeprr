/**
 * Deep-link location tokens for the reader (`?loc=` query param).
 *
 * A `loc` token is a compact, format-agnostic address the Chapters tab emits and
 * the reader honors. Two shapes:
 *   - `spine:<idx>`  — an EPUB spine index (jump to the start of that item).
 *   - `page:<n>`     — a 0-based PDF page index.
 *
 * Resolving a token against a manifest yields a `{ position, locator }` pair in
 * the same coordinate space `useProgress` seeds from, so honoring a `?loc=` is
 * just a matter of overriding the manifest's saved progress before the players
 * mount. No DOM, no React — safe to unit-test in a node environment.
 */

import type { ReaderLocator, ReaderManifest } from '@bookkeeprr/types';
import { pageToPosition, spineToPosition } from './position';

const SPINE_RE = /^spine:(\d+)$/;
const PAGE_RE = /^page:(\d+)$/;

/** The seed a resolved `loc` produces — mirrors a manifest progress slice. */
export type LocSeed = { position: number; locator: ReaderLocator };

/**
 * Resolve a `loc` token against a manifest into a `{ position, locator }` seed,
 * or `null` when the token is absent, malformed, or doesn't apply to this
 * manifest's format. Callers fall back to saved progress on `null`.
 */
export function resolveLoc(
  loc: string | null | undefined,
  manifest: ReaderManifest,
): LocSeed | null {
  if (loc == null || loc === '') return null;

  if (manifest.format === 'epub') {
    const m = SPINE_RE.exec(loc);
    if (m === null) return null;
    const spineCount = Math.max(1, manifest.spine?.length ?? 1);
    const idx = Math.min(spineCount - 1, Math.max(0, Number(m[1])));
    return {
      position: spineToPosition(idx, 0, 1, spineCount),
      locator: { spineIdx: idx, pageInItem: 0 },
    };
  }

  if (manifest.format === 'pdf') {
    const m = PAGE_RE.exec(loc);
    if (m === null) return null;
    const pageCount = Math.max(1, manifest.pageCount ?? 1);
    const page = Math.min(pageCount - 1, Math.max(0, Number(m[1])));
    return {
      position: pageToPosition(page, pageCount),
      locator: { page },
    };
  }

  // No deep-link support for comics / audio.
  return null;
}

/**
 * Apply a `loc` token to a manifest, returning a manifest whose `progress`
 * reflects the resolved location. Prefers `loc` over saved progress when the
 * token resolves; otherwise returns the manifest unchanged (saved progress
 * wins). Never mutates the input.
 */
export function manifestWithLoc(
  manifest: ReaderManifest,
  loc: string | null | undefined,
): ReaderManifest {
  const seed = resolveLoc(loc, manifest);
  if (seed === null) return manifest;
  return {
    ...manifest,
    progress: {
      ...manifest.progress,
      position: seed.position,
      locator: seed.locator,
      // A deep-link is an explicit jump, not a resume-from-finish.
      finished: false,
      restartedFromFinish: false,
    },
  };
}
