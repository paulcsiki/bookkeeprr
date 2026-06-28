import { ProwlarrIndexerList } from './schemas';

export class ProwlarrError extends Error {
  constructor(message: string, public readonly code: 'http' | 'auth' = 'http', public override readonly cause?: unknown) {
    super(message);
    this.name = 'ProwlarrError';
  }
}

export type ProwlarrConn = { url: string; apiKey: string };
export type ProwlarrIndexer = { id: number; name: string; enable: boolean; categories: number[] };

type FetcherResponse = { ok: boolean; status: number; text(): Promise<string> };
type Fetcher = (url: string, apiKey: string) => Promise<FetcherResponse>;
const defaultFetcher: Fetcher = async (url, apiKey) => {
  const r = await fetch(url, { headers: { 'X-Api-Key': apiKey, 'user-agent': 'bookkeeprr/0.1' } });
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;
export function __setProwlarrFetcherForTests(f: Fetcher): void { activeFetcher = f; }
export function __resetProwlarrForTests(): void { activeFetcher = defaultFetcher; }

function base(url: string): string { return url.replace(/\/$/, ''); }

async function getJson(url: string, apiKey: string): Promise<unknown> {
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url, apiKey);
  } catch (err) {
    throw new ProwlarrError('fetch failed', 'http', err);
  }
  if (resp.status === 401 || resp.status === 403) throw new ProwlarrError(`auth failed (${resp.status})`, 'auth');
  if (!resp.ok) throw new ProwlarrError(`HTTP ${resp.status}`, 'http');
  try {
    return JSON.parse(await resp.text());
  } catch (err) {
    throw new ProwlarrError('invalid JSON', 'http', err);
  }
}

export async function listProwlarrIndexers(conn: ProwlarrConn): Promise<ProwlarrIndexer[]> {
  const json = await getJson(`${base(conn.url)}/api/v1/indexer`, conn.apiKey);
  const parsed = ProwlarrIndexerList.safeParse(json);
  if (!parsed.success) throw new ProwlarrError(`indexer list shape invalid: ${parsed.error.message}`, 'http');
  return parsed.data.map((ix) => {
    const cats: number[] = [];
    for (const c of ix.capabilities?.categories ?? []) {
      cats.push(Number(c.id));
      for (const s of c.subCategories ?? []) cats.push(Number(s.id));
    }
    return { id: ix.id, name: ix.name, enable: ix.enable ?? true, categories: cats.filter((n) => Number.isFinite(n)) };
  });
}

export async function testProwlarr(conn: ProwlarrConn): Promise<void> {
  await getJson(`${base(conn.url)}/api/v1/system/status`, conn.apiKey);
}
