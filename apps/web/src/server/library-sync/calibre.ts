const TIMEOUT_MS = 5000;

export class CalibreError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CalibreError';
  }
}

export type CalibreClientConfig = {
  baseUrl: string;
  username: string | null;
  password: string | null;
};

type FetcherResponse = { ok: boolean; status: number; text(): Promise<string> };
type Fetcher = (url: string, init: RequestInit) => Promise<FetcherResponse>;

const defaultFetcher: Fetcher = async (url, init) => {
  const r = await fetch(url, init);
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

export function __setCalibreFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetCalibreForTests(): void {
  activeFetcher = defaultFetcher;
}

function basicAuthHeader(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

export async function refreshLibrary(cfg: CalibreClientConfig, libraryId: string): Promise<void> {
  const url = `${cfg.baseUrl}/cdb/cmd/refresh-library/0?library_id=${encodeURIComponent(libraryId)}`;
  const headers: Record<string, string> = {};
  if (cfg.username !== null && cfg.password !== null) {
    headers.authorization = basicAuthHeader(cfg.username, cfg.password);
  }
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new CalibreError('fetch failed', err);
  }
  if (!resp.ok) {
    throw new CalibreError(`HTTP ${resp.status}`);
  }
}
