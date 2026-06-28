import { describe, expect, it } from 'vitest';
import { acquisitionState } from '@/lib/acquisition';

describe('acquisitionState', () => {
  it('(0,0) → missing', () => {
    expect(acquisitionState(0, 0)).toBe('missing');
  });

  it('(0,5) → missing', () => {
    expect(acquisitionState(0, 5)).toBe('missing');
  });

  it('(2,5) → partial', () => {
    expect(acquisitionState(2, 5)).toBe('partial');
  });

  it('(5,5) → complete', () => {
    expect(acquisitionState(5, 5)).toBe('complete');
  });

  it('(6,5) → complete', () => {
    expect(acquisitionState(6, 5)).toBe('complete');
  });

  it('(3,0) → partial (no volume info yet)', () => {
    expect(acquisitionState(3, 0)).toBe('partial');
  });
});
