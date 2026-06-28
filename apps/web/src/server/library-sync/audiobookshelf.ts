import { z } from 'zod';

const TIMEOUT_MS = 5000;

export class AudiobookshelfError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AudiobookshelfError';
  }
}

export type AudiobookshelfLibrary = {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
};

export type AudiobookshelfClientConfig = {
  baseUrl: string;
  apiToken: string;
};

type FetcherResponse = { ok: boolean; status: number; text(): Promise<string> };
type Fetcher = (url: string, init: RequestInit) => Promise<FetcherResponse>;

const defaultFetcher: Fetcher = async (url, init) => {
  const r = await fetch(url, init);
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

export function __setAudiobookshelfFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetAudiobookshelfForTests(): void {
  activeFetcher = defaultFetcher;
}

function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export async function scanLibrary(
  cfg: AudiobookshelfClientConfig,
  libraryId: string,
): Promise<void> {
  const url = `${cfg.baseUrl}/api/libraries/${encodeURIComponent(libraryId)}/scan`;
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url, {
      method: 'POST',
      headers: authHeader(cfg.apiToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AudiobookshelfError('fetch failed', err);
  }
  if (!resp.ok) {
    throw new AudiobookshelfError(`HTTP ${resp.status}`);
  }
}

const LibrariesResponse = z.object({
  libraries: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mediaType: z.string(),
    }),
  ),
});

export async function listLibraries(
  cfg: AudiobookshelfClientConfig,
): Promise<AudiobookshelfLibrary[]> {
  const url = `${cfg.baseUrl}/api/libraries`;
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url, {
      method: 'GET',
      headers: authHeader(cfg.apiToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AudiobookshelfError('fetch failed', err);
  }
  if (!resp.ok) {
    throw new AudiobookshelfError(`HTTP ${resp.status}`);
  }
  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new AudiobookshelfError('response shape invalid', err);
  }
  const validated = LibrariesResponse.safeParse(parsed);
  if (!validated.success) {
    throw new AudiobookshelfError('response shape invalid', validated.error);
  }
  return validated.data.libraries
    .filter((l) => l.mediaType === 'book')
    .map((l) => ({ id: l.id, name: l.name, mediaType: 'book' as const }));
}
