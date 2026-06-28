import { previewFor } from '@/features/settings/naming/preview';

describe('previewFor', () => {
  it('renders the manga volume default against the Chainsaw Man fixture', () => {
    const r = previewFor('volume', '{series_title} - v{volume:00} [{group}].{ext}', 'manga');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preview).toContain('Chainsaw Man');
      expect(r.preview).toContain('v14');
      expect(r.preview).toBe('Chainsaw Man - v14 [LH].cbz');
    }
  });

  it('renders the chapter template with the fixture chapter', () => {
    const r = previewFor('chapter', '{series_title} - c{chapter:000} [{group}].{ext}', 'manga');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preview).toBe('Chainsaw Man - c142 [LH].cbz');
  });

  it('renders the batch template with the chapter range', () => {
    const r = previewFor('batch', '{series_title} - c{chapter_range} [{group}].{ext}', 'manga');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preview).toBe('Chainsaw Man - c001-012 [LH].cbz');
  });

  it('renders the series_folder template', () => {
    const r = previewFor('series_folder', '{series_title}', 'manga');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preview).toBe('Chainsaw Man');
  });

  it('flags an unknown token as invalid', () => {
    const r = previewFor('volume', '{series_title} {nope}', 'manga');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unknown token 'nope'");
  });

  it('flags a token forbidden for the volume kind', () => {
    // `{chapter}` is not allowed in a volume template.
    const r = previewFor('volume', '{series_title} c{chapter}', 'manga');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('not allowed in volume');
  });

  it('renders an empty volume_subfolder to the empty string', () => {
    const r = previewFor('volume_subfolder', '', 'manga');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preview).toBe('');
  });
});
