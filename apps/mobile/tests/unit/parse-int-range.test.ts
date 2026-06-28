import { parseIntInRange } from '@/lib/parse-int-range';

describe('parseIntInRange', () => {
  describe('valid inputs', () => {
    it('returns ok:true with the parsed value for a valid integer in range', () => {
      expect(parseIntInRange('5', 0, 100)).toEqual({ ok: true, value: 5 });
    });

    it('accepts the minimum boundary value', () => {
      expect(parseIntInRange('0', 0, 100)).toEqual({ ok: true, value: 0 });
    });

    it('accepts the maximum boundary value', () => {
      expect(parseIntInRange('100', 0, 100)).toEqual({ ok: true, value: 100 });
    });

    it('trims surrounding whitespace before parsing', () => {
      expect(parseIntInRange('  42  ', 0, 100)).toEqual({ ok: true, value: 42 });
    });

    it('accepts a negative number when min is negative', () => {
      expect(parseIntInRange('-50', -1000, 0)).toEqual({ ok: true, value: -50 });
    });

    it('accepts zero when min is negative', () => {
      expect(parseIntInRange('0', -100, 100)).toEqual({ ok: true, value: 0 });
    });
  });

  describe('below minimum', () => {
    it('returns ok:false when value is below min', () => {
      const result = parseIntInRange('-1', 0, 100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('0');
      }
    });

    it('returns ok:false when negative value is below the negative min', () => {
      const result = parseIntInRange('-1001', -1000, 0);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('-1000');
      }
    });
  });

  describe('above maximum', () => {
    it('returns ok:false when value exceeds max', () => {
      const result = parseIntInRange('101', 0, 100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('100');
      }
    });
  });

  describe('non-integer inputs', () => {
    it('rejects a decimal number', () => {
      const result = parseIntInRange('3.14', 0, 100);
      expect(result.ok).toBe(false);
    });

    it('rejects alphabetic input', () => {
      const result = parseIntInRange('abc', 0, 100);
      expect(result.ok).toBe(false);
    });

    it('rejects a mixed alphanumeric string', () => {
      const result = parseIntInRange('10px', 0, 100);
      expect(result.ok).toBe(false);
    });

    it('rejects a negative sign when min >= 0', () => {
      const result = parseIntInRange('-5', 0, 100);
      expect(result.ok).toBe(false);
    });
  });

  describe('empty input', () => {
    it('rejects an empty string', () => {
      const result = parseIntInRange('', 0, 100);
      expect(result.ok).toBe(false);
    });

    it('rejects a whitespace-only string', () => {
      const result = parseIntInRange('   ', 0, 100);
      expect(result.ok).toBe(false);
    });
  });
});
