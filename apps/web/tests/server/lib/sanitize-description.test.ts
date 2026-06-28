import { describe, expect, it } from 'vitest';
import { sanitizeDescription } from '@/lib/sanitize-description';

describe('sanitizeDescription', () => {
  it('returns null for null/empty', () => {
    expect(sanitizeDescription(null)).toBeNull();
    expect(sanitizeDescription(undefined)).toBeNull();
    expect(sanitizeDescription('   ')).toBeNull();
  });

  it('drops a leaked PDF/download markdown link and backslash escapes', () => {
    const raw =
      '[Rich Dad, Poor Dad PDF](https://chesserresources.com/doc/rich-dad-poor-dad-by-robert-kiyosaki-pdf/)\\\n\\\nApril of 2022 marks a 25-year milestone. The lessons haven’t changed.\\';
    const out = sanitizeDescription(raw);
    expect(out).toBe('April of 2022 marks a 25-year milestone. The lessons haven’t changed.');
    expect(out).not.toContain('chesserresources');
    expect(out).not.toContain('\\');
  });

  it('unwraps a normal markdown link to its text', () => {
    expect(sanitizeDescription('See [the author](https://example.com/author) page.')).toBe(
      'See the author page.',
    );
  });

  it('strips HTML tags and converts <br> to newlines', () => {
    expect(sanitizeDescription('A great <i>tale</i>.<br><br>Volume one.')).toBe(
      'A great tale.\n\nVolume one.',
    );
  });

  it('decodes common HTML entities', () => {
    expect(sanitizeDescription('Tom &amp; Jerry &quot;quoted&quot; &#39;ok&#39;')).toBe(
      'Tom & Jerry "quoted" \'ok\'',
    );
  });

  it('collapses excess blank lines and trims', () => {
    expect(sanitizeDescription('  Para one.\n\n\n\nPara two.  ')).toBe('Para one.\n\nPara two.');
  });

  it('leaves clean prose untouched', () => {
    const clean = 'A standalone novel about money and mindset.';
    expect(sanitizeDescription(clean)).toBe(clean);
  });
});
