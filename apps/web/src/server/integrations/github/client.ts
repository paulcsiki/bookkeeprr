import { BUILD_INFO } from '@/server/build-info';
import type { GhRelease, GitHubErrorCode } from './types';

const GITHUB_REPO = 'paulcsiki/bookkeeprr';
const GITHUB_API = 'https://api.github.com';
const USER_AGENT = `bookkeeprr/${BUILD_INFO.version}`;
const FETCH_TIMEOUT_MS = 10_000;

export class GitHubError extends Error {
  constructor(
    public code: GitHubErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export async function fetchReleases(limit = 10): Promise<GhRelease[]> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/releases?per_page=${limit}`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new GitHubError('http', err instanceof Error ? err.message : String(err));
  }

  if (res.status === 403) {
    throw new GitHubError(
      'rate-limited',
      `rate-limited (reset at ${res.headers.get('x-ratelimit-reset') ?? '?'})`,
    );
  }
  if (!res.ok) {
    throw new GitHubError('http', `${res.status} ${await res.text()}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new GitHubError('parse', err instanceof Error ? err.message : String(err));
  }
  if (!Array.isArray(body)) {
    throw new GitHubError('parse', 'response was not an array');
  }

  return body
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .filter((r) => r.draft !== true)
    .map(
      (r): GhRelease => ({
        tagName: String(r.tag_name ?? ''),
        name: typeof r.name === 'string' ? r.name : null,
        body: typeof r.body === 'string' ? r.body : null,
        htmlUrl: String(r.html_url ?? ''),
        publishedAt: typeof r.published_at === 'string' ? r.published_at : null,
        prerelease: r.prerelease === true,
        draft: r.draft === true,
      }),
    );
}
