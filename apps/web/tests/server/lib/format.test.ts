import { describe, expect, it } from 'vitest';
import { fmtRuntime } from '@/lib/format';

describe('fmtRuntime', () => {
  it('formats compound hours+minutes', () => {
    expect(fmtRuntime(750)).toBe('12h 30m');
    expect(fmtRuntime(125)).toBe('2h 5m');
  });

  it('drops the minutes part on a whole hour', () => {
    expect(fmtRuntime(60)).toBe('1h');
    expect(fmtRuntime(120)).toBe('2h');
  });

  it('formats sub-hour values in minutes', () => {
    expect(fmtRuntime(45)).toBe('45m');
    expect(fmtRuntime(0)).toBe('0m');
  });

  it('renders an em dash for null/undefined/negative', () => {
    expect(fmtRuntime(null)).toBe('—');
    expect(fmtRuntime(undefined)).toBe('—');
    expect(fmtRuntime(-5)).toBe('—');
  });
});
