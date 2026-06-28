import { describe, it, expect } from 'vitest';
import { buildReadableKey, parseReadableKey } from '@bookkeeprr/types';

describe('readableKey', () => {
  it('builds + parses a paged file key', () => {
    expect(buildReadableKey({ kind: 'page', fileId: 12 })).toBe('page:file:12');
    expect(parseReadableKey('page:file:12')).toEqual({ kind: 'page', fileId: 12 });
  });
  it('builds + parses an audio volume key', () => {
    expect(buildReadableKey({ kind: 'audio', volumeId: 5 })).toBe('audio:vol:5');
    expect(parseReadableKey('audio:vol:5')).toEqual({ kind: 'audio', volumeId: 5 });
  });
  it('rejects malformed keys', () => {
    expect(() => parseReadableKey('garbage')).toThrow();
    expect(() => parseReadableKey('page:file:x')).toThrow();
  });
});
