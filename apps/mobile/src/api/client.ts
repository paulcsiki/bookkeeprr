import type { Credentials } from '@/auth/token-store';
import { useConnectivity } from '@/state/connectivityStore';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface ApiClient {
  get: <T = unknown>(path: string) => Promise<T>;
  post: <T = unknown>(path: string, body: unknown) => Promise<T>;
  put: <T = unknown>(path: string, body: unknown) => Promise<T>;
  patch: <T = unknown>(path: string, body: unknown) => Promise<T>;
  delete: <T = unknown>(path: string) => Promise<T>;
}

export interface ClientOptions {
  onAuthFail?: () => void;
}

// Hard ceiling on a single request. Without it, a server that accepts the
// connection but never responds (e.g. a handler blocked on an unreachable
// qBittorrent) leaves the fetch pending forever — which surfaces as a screen
// stuck on its loading skeleton. With it, the request aborts and the query
// settles into an error state the UI can show + retry.
const REQUEST_TIMEOUT_MS = 30_000;

export function createApiClient(creds: Credentials, opts: ClientOptions = {}): ApiClient {
  async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const url = `${creds.serverUrl.replace(/\/$/, '')}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.token}`,
        },
        body: body === undefined ? null : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // No HTTP response came back — a network-class failure (timeout/abort or a
      // connection error). The server is not reachable from here.
      useConnectivity.getState().noteServerReachable(false);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(0, null, `${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    // A Response was received — regardless of status (even 4xx/5xx, which throw
    // an ApiError below) bytes came back, so the server is reachable.
    useConnectivity.getState().noteServerReachable(true);
    // Only 401 means the stored credentials are no longer good → sign out and
    // bounce to onboarding. 403 is "authenticated but not allowed" (e.g. a
    // non-admin hitting an admin route) — surface it as an error; do NOT sign
    // out, or visiting an admin-only screen as a non-admin would log you out.
    if (res.status === 401) opts.onAuthFail?.();
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* no body */
    }
    if (!res.ok) {
      throw new ApiError(res.status, parsed, `${method} ${path} failed: ${res.status}`);
    }
    return parsed as T;
  }
  return {
    get: <T>(p: string) => call<T>('GET', p),
    post: <T>(p: string, b: unknown) => call<T>('POST', p, b),
    put: <T>(p: string, b: unknown) => call<T>('PUT', p, b),
    patch: <T>(p: string, b: unknown) => call<T>('PATCH', p, b),
    delete: <T>(p: string) => call<T>('DELETE', p),
  };
}
