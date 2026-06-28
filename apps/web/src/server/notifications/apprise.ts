import type { FormattedNotification } from './format';

export class AppriseError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppriseError';
  }
}

type FetcherResponse = { ok: boolean; status: number; text(): Promise<string> };
type Fetcher = (url: string, init: RequestInit) => Promise<FetcherResponse>;

const defaultFetcher: Fetcher = async (url, init) => {
  const r = await fetch(url, init);
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

export function __setAppriseFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetAppriseForTests(): void {
  activeFetcher = defaultFetcher;
}

export async function sendApprise(url: string, formatted: FormattedNotification): Promise<void> {
  const payload = {
    title: formatted.title,
    body: formatted.body,
    type: formatted.level,
  };

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    throw new AppriseError('fetch failed', err);
  }
  if (!resp.ok) {
    throw new AppriseError(`HTTP ${resp.status}`);
  }
}
