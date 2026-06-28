import { z } from 'zod';

export class FlaresolverrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlaresolverrError';
  }
}

const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().nullish(),
});

export type FlaresolverrCookie = z.infer<typeof CookieSchema>;

const SolutionSchema = z.object({
  response: z.string(),
  userAgent: z.string().nullish(),
  cookies: z.array(CookieSchema).nullish(),
});

const ResponseSchema = z.object({
  status: z.string(),
  message: z.string().nullish(),
  solution: SolutionSchema.nullish(),
});

const DEFAULT_MAX_TIMEOUT_MS = 60000;

/**
 * Solve a GET request through a FlareSolverr proxy, returning the rendered HTML
 * after any Cloudflare "Just a moment" challenge is passed.
 *
 * @param baseUrl  FlareSolverr base URL, e.g. `http://flaresolverr:8191`.
 * @param targetUrl  The URL to fetch through FlareSolverr.
 */
export async function solveGet(
  baseUrl: string,
  targetUrl: string,
  opts?: { maxTimeoutMs?: number },
): Promise<{ html: string; userAgent: string | null; cookies: FlaresolverrCookie[] }> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1`;
  const maxTimeout = opts?.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url: targetUrl, maxTimeout }),
    });
  } catch (err) {
    throw new FlaresolverrError(`FlareSolverr request failed: ${(err as Error).message}`);
  }

  if (!res.ok) {
    throw new FlaresolverrError(`FlareSolverr returned HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new FlaresolverrError('FlareSolverr returned a non-JSON response');
  }

  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new FlaresolverrError('FlareSolverr returned an unexpected response shape');
  }

  if (parsed.data.status !== 'ok' || !parsed.data.solution) {
    throw new FlaresolverrError(
      parsed.data.message && parsed.data.message.length > 0
        ? `FlareSolverr error: ${parsed.data.message}`
        : `FlareSolverr status: ${parsed.data.status}`,
    );
  }

  return {
    html: parsed.data.solution.response,
    userAgent: parsed.data.solution.userAgent ?? null,
    cookies: parsed.data.solution.cookies ?? [],
  };
}

/**
 * Solve a host through FlareSolverr and extract the Cloudflare clearance: a
 * `Cookie` header string (built from the returned cookies, which include
 * `cf_clearance`) plus the browser `userAgent`.
 *
 * The `cf_clearance` cookie is bound to the User-Agent that obtained it AND to
 * the egress IP — so the caller MUST reuse this exact `userAgent` and run from
 * the same network as FlareSolverr (same container cluster) when fetching the
 * gated resource directly.
 *
 * Returns null when the solve yields no usable `cf_clearance` cookie. Throws
 * {@link FlaresolverrError} on a FlareSolverr-level failure (caller handles).
 */
export async function getCfClearance(
  baseUrl: string,
  targetUrl: string,
  opts?: { maxTimeoutMs?: number },
): Promise<{ cookie: string; userAgent: string } | null> {
  const { userAgent, cookies } = await solveGet(baseUrl, targetUrl, opts);
  const hasClearance = cookies.some((c) => c.name === 'cf_clearance');
  if (!hasClearance || cookies.length === 0) return null;
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return { cookie, userAgent: userAgent ?? '' };
}
