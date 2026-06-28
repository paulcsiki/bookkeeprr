import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFilename } from '@/server/parser/filename';

type Case = {
  input: string;
  expected: {
    volume: number | null;
    chapter: string | null;
    group: string | null;
    confidence: number;
  };
};

const cases: Case[] = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../src/server/parser/__fixtures__/filenames.json'),
    'utf8',
  ),
);

describe('parseFilename', () => {
  for (const c of cases) {
    it(`parses: ${c.input}`, () => {
      const r = parseFilename(c.input);
      expect(r.volume).toBe(c.expected.volume);
      expect(r.chapter).toBe(c.expected.chapter);
      expect(r.group).toBe(c.expected.group);
      expect(r.confidence).toBeCloseTo(c.expected.confidence, 2);
    });
  }

  it('returns debug metadata', () => {
    const r = parseFilename('Series - v01 [GRP].cbz');
    expect(r.debug.matchedPattern).toBeTruthy();
    expect(r.debug.stripped).not.toContain('[');
    expect(r.debug.stripped).not.toContain('.cbz');
  });
});
