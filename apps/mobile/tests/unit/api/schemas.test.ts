import { HandshakeResponse, SeriesSummary, SeriesDetail, VersionResponse, ExchangeResponse } from '@/api/schemas';

describe('api schemas', () => {
  it('parses a handshake response', () => {
    const r = HandshakeResponse.parse({
      server_version: '0.1.0',
      supported_auth_modes: ['password', 'oidc'],
      brand: 'bookkeeprr',
    });
    expect(r.server_version).toBe('0.1.0');
  });

  it('parses a series summary', () => {
    const s = SeriesSummary.parse({
      id: 1,
      title: 'Vinland Saga',
      contentType: 'manga',
      coverUrl: null,
      monitored: true,
      volumes: 25,
      downloaded: 20,
    });
    expect(s.contentType).toBe('manga');
  });

  it('rejects an invalid content type', () => {
    expect(() =>
      SeriesSummary.parse({
        id: 1,
        title: 'x',
        contentType: 'comic-book',
        monitored: true,
        volumes: 1,
        downloaded: 0,
      }),
    ).toThrow();
  });

  it('parses a version response', () => {
    const v = VersionResponse.parse({ current: '0.1.0', min_supported: '0.1.0' });
    expect(v.current).toBe('0.1.0');
  });

  it('parses an exchange response', () => {
    const e = ExchangeResponse.parse({
      token: 't',
      refresh_token: 'r',
      expires_at: '2026-08-25T00:00:00Z',
    });
    expect(e.token).toBe('t');
  });

  it('SeriesDetail hydrating field defaults to false for back-compat', () => {
    const base = {
      id: 1,
      title: 'Test',
      contentType: 'manga',
      coverUrl: null,
      monitored: true,
      volumes: 1,
      downloaded: 0,
      groupId: null,
      groupPath: '',
      description: null,
      author: null,
      startYear: null,
      volumesList: [],
    };
    // Server omits hydrating → defaults to false (back-compat with old servers).
    const withoutField = SeriesDetail.parse(base);
    expect(withoutField.hydrating).toBe(false);
    // Server includes hydrating:true → real background-job signal.
    const withTrue = SeriesDetail.parse({ ...base, hydrating: true });
    expect(withTrue.hydrating).toBe(true);
    // Server includes hydrating:false → idle.
    const withFalse = SeriesDetail.parse({ ...base, hydrating: false });
    expect(withFalse.hydrating).toBe(false);
  });
});
