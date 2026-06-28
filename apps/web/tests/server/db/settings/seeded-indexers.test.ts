import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  seededIndexerKindsSetting,
  SeededIndexerKindsSchema,
} from '@/server/db/settings/seeded-indexers';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('seededIndexerKindsSetting', () => {
  it('returns empty array when no value has been set', async () => {
    // Reset to empty (seedDb pre-populates the setting via seedDefaultIndexers).
    await seededIndexerKindsSetting.set([]);
    const cfg = await seededIndexerKindsSetting.get();
    expect(cfg).toEqual([]);
  });

  it('round-trips a save', async () => {
    await seededIndexerKindsSetting.set(['nyaa', 'filelist']);
    const cfg = await seededIndexerKindsSetting.get();
    expect(cfg).toEqual(['nyaa', 'filelist']);
  });

  it('round-trips a single-element save', async () => {
    await seededIndexerKindsSetting.set(['nyaa']);
    expect(await seededIndexerKindsSetting.get()).toEqual(['nyaa']);
  });
});

describe('SeededIndexerKindsSchema', () => {
  it('accepts an empty array', () => {
    expect(SeededIndexerKindsSchema.parse([])).toEqual([]);
  });

  it('accepts arrays of strings', () => {
    expect(SeededIndexerKindsSchema.parse(['nyaa', 'filelist'])).toEqual(['nyaa', 'filelist']);
  });

  it('rejects non-array', () => {
    expect(() => SeededIndexerKindsSchema.parse('nyaa')).toThrow();
  });

  it('rejects arrays with non-string elements', () => {
    expect(() => SeededIndexerKindsSchema.parse([1, 2])).toThrow();
  });
});
