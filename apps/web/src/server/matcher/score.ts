import type { ParsedRelease } from '@/server/parser/release';
import type { QualityProfileRow } from '@/server/db/schema';
import type { IndexerResult } from '@/server/integrations/indexers/types';
import {
  DEFAULT_WEIGHTS,
  type ScoringWeights,
  type AdultFilter,
} from '@/server/db/settings/matcher';

export { DEFAULT_WEIGHTS };
export type { ScoringWeights, AdultFilter };

function parseList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function scoreRelease(
  parsed: ParsedRelease,
  profile: QualityProfileRow,
  raw: IndexerResult,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  adultFilter: AdultFilter | null = null,
): number | null {
  if (
    adultFilter !== null &&
    adultFilter.enabled &&
    adultFilter.blockedCategories.includes(raw.category)
  ) {
    return null;
  }

  const effectiveLanguage = parsed.language ?? 'en';
  const preferredLanguages = parseList(profile.preferredLanguagesJson);
  if (preferredLanguages.length > 0 && !preferredLanguages.includes(effectiveLanguage)) {
    return null;
  }
  const sizeMb = raw.sizeBytes / (1024 * 1024);
  if (profile.minSizeMb !== null && profile.minSizeMb !== undefined && sizeMb < profile.minSizeMb) {
    return null;
  }
  if (profile.maxSizeMb !== null && profile.maxSizeMb !== undefined && sizeMb > profile.maxSizeMb) {
    return null;
  }

  let s = 0;
  const groups = parseList(profile.preferredGroupsJson);
  if (parsed.group) {
    const idx = groups.findIndex((g) => g.toLowerCase() === parsed.group!.toLowerCase());
    if (idx >= 0) s += Math.max(0, weights.groupTopWeight - idx * weights.groupStepDown);
  }
  if (profile.preferCompleteBatches && parsed.isBatch) s += weights.batchBonus;
  s += Math.log10(Math.max(raw.seeders, 0) + 1) * weights.seederMultiplier;
  if (raw.trusted) s += weights.trustedBonus;
  if (raw.remake) s += weights.remakePenalty;
  return Math.max(0, s);
}
