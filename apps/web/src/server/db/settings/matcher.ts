import { z } from 'zod';
import { defineSetting } from '../settings';

export const ScoringWeightsSchema = z.object({
  groupTopWeight: z.number().int().min(0).max(1000),
  groupStepDown: z.number().int().min(0).max(100),
  batchBonus: z.number().int().min(0).max(1000),
  seederMultiplier: z.number().int().min(0).max(100),
  trustedBonus: z.number().int().min(0).max(1000),
  remakePenalty: z.number().int().min(-1000).max(0),
  // Hard floor on swarm health: releases with fewer seeders than this are
  // rejected before grabbing (a dead torrent never completes and just stalls).
  // `.default(1)` migrates settings stored before this field existed — a value
  // of 0 disables the filter. Enforced in matchRelease, not in scoreRelease.
  minSeeders: z.number().int().min(0).max(10000).default(1),
});

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

export const DEFAULT_WEIGHTS: ScoringWeights = {
  groupTopWeight: 100,
  groupStepDown: 10,
  batchBonus: 30,
  seederMultiplier: 5,
  trustedBonus: 10,
  remakePenalty: -15,
  minSeeders: 1,
};

export const AdultFilterSchema = z.object({
  enabled: z.boolean(),
  blockedCategories: z.array(z.string().max(32)),
});

export type AdultFilter = z.infer<typeof AdultFilterSchema>;

export const DEFAULT_ADULT_FILTER: AdultFilter = {
  enabled: true,
  blockedCategories: ['4_1', '4_2', '4_3', '4_4'],
};

export const scoringWeightsSetting = defineSetting(
  'matcher.scoring_weights',
  ScoringWeightsSchema,
  DEFAULT_WEIGHTS,
);

export const adultFilterSetting = defineSetting(
  'matcher.adult_filter',
  AdultFilterSchema,
  DEFAULT_ADULT_FILTER,
);

export const MatcherAutoReplaySchema = z.boolean();
export type MatcherAutoReplay = z.infer<typeof MatcherAutoReplaySchema>;

export const matcherAutoReplaySetting = defineSetting<MatcherAutoReplay>(
  'matcher.auto_replay_on_save',
  MatcherAutoReplaySchema,
  false,
);
