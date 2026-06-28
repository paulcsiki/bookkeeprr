import { Download, DownloadStatus, DownloadsResponse } from '@/api/schemas';

describe('downloads schemas', () => {
  it('parses a downloading row', () => {
    const d = Download.parse({
      id: 1,
      qbtHash: 'abc',
      status: 'downloading',
      addedAt: '2026-05-26T09:00:00Z',
      completedAt: null,
      importedAt: null,
      error: null,
      release: { id: 9, title: 'Vinland.Saga.v28.cbz', indexerGuid: 'g-9' },
      series: { id: 1, title: 'Vinland Saga' },
    });
    expect(d.status).toBe('downloading');
  });

  it('parses an imported row with importedAt', () => {
    const d = Download.parse({
      id: 2,
      qbtHash: 'def',
      status: 'imported',
      addedAt: '2026-05-26T08:00:00Z',
      completedAt: '2026-05-26T08:30:00Z',
      importedAt: '2026-05-26T08:31:00Z',
      error: null,
      release: { id: 8, title: 'x', indexerGuid: 'g-8' },
      series: { id: 1, title: 'Vinland Saga' },
    });
    expect(d.importedAt).toBe('2026-05-26T08:31:00Z');
  });

  it('parses a row without release or series', () => {
    const d = Download.parse({
      id: 3,
      qbtHash: 'orphan',
      status: 'failed',
      addedAt: '2026-05-26T07:00:00Z',
      completedAt: null,
      importedAt: null,
      error: 'qbt unreachable',
      release: null,
      series: null,
    });
    expect(d.error).toBe('qbt unreachable');
  });

  it('passes an unknown future status through as a raw string (forward-compat)', () => {
    // A status this build predates must NOT throw — old apps have to tolerate
    // new server statuses or the whole response blanks the screen.
    expect(DownloadStatus.parse('warp-speed')).toBe('warp-speed');
  });

  it('parses a full Download row carrying an unknown status', () => {
    const d = Download.parse({
      id: 4,
      qbtHash: 'future',
      status: 'quantum-paused',
      addedAt: '2026-05-26T07:00:00Z',
      completedAt: null,
      importedAt: null,
      error: null,
      release: null,
      series: null,
    });
    expect(d.status).toBe('quantum-paused');
  });

  it('parses a DownloadsResponse envelope', () => {
    const r = DownloadsResponse.parse({ downloads: [] });
    expect(r.downloads).toEqual([]);
  });
});
