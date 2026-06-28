/**
 * Shared helpers for computing scan-group summaries.
 * Used by both GET /api/scan/groups and the server-rendered scan page.
 */
import { dirname, isAbsolute, relative } from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { scanMatches, type ScanMatchRow } from '@/server/db/schema';
import { dirHash } from '@/lib/dir-hash';
import { getSeriesByAniListId } from '@/server/db/series';

export type AniListStash = {
  anilistId?: number;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  coverUrl?: string | null;
} | null;

export type GroupFile = {
  path: string;
  volume: number | null;
  chapter: string | null;
  confidence: number;
};

export type GroupSummary = {
  dirHash: string;
  directory: string;
  dirname: string;
  fileCount: number;
  proposedAniListId: number | null;
  proposedTitle: string | null;
  proposedCoverUrl: string | null;
  existingSeriesId: number | null;
  inferredGranularity: 'volume' | 'chapter';
  avgConfidence: number;
  relativeDir: string;
  structure: 'flat' | 'mirror' | null;
  files: GroupFile[];
};

/** Series dir relative to the scan root; '' at the root, outside it, or for
 *  legacy rows without scan-session params. */
export function relativeDirOf(scanRootPath: string | null, directory: string): string {
  if (!scanRootPath) return '';
  const rel = relative(scanRootPath, directory);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return '';
  return rel;
}

function parseAniListStash(json: string): AniListStash {
  try {
    const debug = JSON.parse(json) as { aniListMatch?: AniListStash };
    return debug.aniListMatch ?? null;
  } catch {
    return null;
  }
}

/** Build a GroupSummary[] from all pending scan_matches rows, sorted by dirname. */
export async function buildGroupSummaries(): Promise<GroupSummary[]> {
  const rows = (await getDb()
    .select()
    .from(scanMatches)
    .where(eq(scanMatches.status, 'pending'))) as ScanMatchRow[];

  const byDir = new Map<string, ScanMatchRow[]>();
  for (const r of rows) {
    const dir = dirname(r.filePath);
    let bucket = byDir.get(dir);
    if (!bucket) {
      bucket = [];
      byDir.set(dir, bucket);
    }
    bucket.push(r);
  }

  const groups: GroupSummary[] = [];
  for (const [directory, bucket] of byDir) {
    const stash = parseAniListStash(bucket[0]!.parserDebugJson);
    const anilistId = stash?.anilistId ?? null;
    const existing =
      anilistId !== null && anilistId !== undefined ? await getSeriesByAniListId(anilistId) : null;
    const avgConfidence = bucket.reduce((s, r) => s + (r.confidence ?? 0), 0) / bucket.length;
    const hasChapter = bucket.some((r) => r.proposedChapter !== null);
    const dirBase = directory.split('/').pop() ?? directory;
    groups.push({
      dirHash: dirHash(directory),
      directory,
      dirname: dirBase,
      fileCount: bucket.length,
      proposedAniListId: anilistId,
      proposedTitle: stash?.titleRomaji ?? stash?.titleEnglish ?? stash?.titleNative ?? null,
      proposedCoverUrl: stash?.coverUrl ?? null,
      existingSeriesId: existing?.id ?? null,
      inferredGranularity: hasChapter ? 'chapter' : 'volume',
      avgConfidence,
      relativeDir: relativeDirOf(bucket[0]!.scanRootPath, directory),
      structure: bucket[0]!.structure ?? null,
      files: bucket.map((r) => ({
        path: r.filePath,
        volume: r.proposedVolume,
        chapter: r.proposedChapter,
        confidence: r.confidence ?? 0,
      })),
    });
  }

  groups.sort((a, b) => a.dirname.localeCompare(b.dirname));
  return groups;
}
