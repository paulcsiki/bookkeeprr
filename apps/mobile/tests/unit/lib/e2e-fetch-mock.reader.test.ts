import { installFetchMock } from '@/lib/e2e-fetch-mock';
import { ContinueReadingResponse, ReaderManifest } from '@/api/schemas';

// The Maestro reader flows (tests/e2e/reader/*.yaml) consume these routes on the
// CI device. Validating the mock payloads against the same zod schemas the app
// parses them with catches contract drift here, where it's cheap, rather than in
// a device run.

const originalFetch = globalThis.fetch;

beforeAll(() => {
  installFetchMock();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('e2e-fetch-mock reader extensions', () => {
  it('GET /api/reader/progress returns a schema-valid Continue-Reading list', async () => {
    const res = await fetch('https://srv/api/reader/progress');
    const body = ContinueReadingResponse.parse(await res.json());
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.map((i) => i.readableKey)).toContain('page:file:42');
    expect(body.items.map((i) => i.readableKey)).toContain('audio:vol:5');
  });

  it('GET /api/reader/manifest?fileId=… resolves a comics manifest', async () => {
    const res = await fetch('https://srv/api/reader/manifest?fileId=42');
    const manifest = ReaderManifest.parse(await res.json());
    expect(manifest.reader).toBe('comics');
    expect(manifest.readableKey).toBe('page:file:42');
  });

  it('GET /api/reader/manifest?volumeId=… resolves an audio manifest', async () => {
    const res = await fetch('https://srv/api/reader/manifest?volumeId=5');
    const manifest = ReaderManifest.parse(await res.json());
    expect(manifest.reader).toBe('audio');
    expect(manifest.readableKey).toBe('audio:vol:5');
  });

  it('PUT /api/reader/progress/<key> acknowledges a progress write', async () => {
    const res = await fetch('https://srv/api/reader/progress/page%3Afile%3A42', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: 0.5 }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
  });

  it('GET /api/reader/comics/<id>/page/<n> serves image bytes', async () => {
    const res = await fetch('https://srv/api/reader/comics/42/page/0');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });
});
