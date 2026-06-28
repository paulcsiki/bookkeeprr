import { z } from 'zod';
import { defineSetting } from '../settings';

export const SeededIndexerKindsSchema = z.array(z.string());

export type SeededIndexerKinds = z.infer<typeof SeededIndexerKindsSchema>;

export const DEFAULT_SEEDED_INDEXER_KINDS: SeededIndexerKinds = [];

export const seededIndexerKindsSetting = defineSetting(
  'indexers.seeded_kinds',
  SeededIndexerKindsSchema,
  DEFAULT_SEEDED_INDEXER_KINDS,
);
