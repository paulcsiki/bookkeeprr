import { loadChangelog, getVersionEntry, hasVersion } from '@/lib/changelog';

describe('changelog accessor', () => {
  it('loads the bundled changelog', () => {
    const c = loadChangelog();
    expect(c.versions.length).toBeGreaterThan(0);
  });

  it('every entry has version, date, summary, sections', () => {
    for (const v of loadChangelog().versions) {
      expect(v.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(v.date).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
      expect(v.summary.length).toBeGreaterThan(0);
      expect(v.sections.length).toBeGreaterThan(0);
      for (const s of v.sections) {
        expect(['feat', 'fix', 'perf', 'break']).toContain(s.kind);
        expect(s.label.length).toBeGreaterThan(0);
        expect(s.items.length).toBeGreaterThan(0);
      }
    }
  });

  it('getVersionEntry returns matching version', () => {
    const v = getVersionEntry('0.1.0');
    expect(v?.version).toBe('0.1.0');
  });

  it('getVersionEntry returns undefined for unknown', () => {
    expect(getVersionEntry('99.99.99')).toBeUndefined();
  });

  it('hasVersion reflects presence', () => {
    expect(hasVersion('0.1.0')).toBe(true);
    expect(hasVersion('99.99.99')).toBe(false);
  });
});
