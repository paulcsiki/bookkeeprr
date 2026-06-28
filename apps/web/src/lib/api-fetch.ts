'use client';

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const meta =
    typeof document !== 'undefined'
      ? (document.querySelector('meta[name="x-api-key"]') as HTMLMetaElement | null)
      : null;
  const key = meta?.content;
  const headers = new Headers(init.headers);
  if (key && key.length > 0) {
    headers.set('X-Api-Key', key);
  }
  return fetch(input, { ...init, headers }).then((res) => {
    if (res.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      // Avoid redirect loops from the auth endpoints themselves.
      if (!path.startsWith('/login') && !path.startsWith('/api/auth/')) {
        const next = encodeURIComponent(path + window.location.search);
        window.location.href = `/login?next=${next}`;
      }
    }
    return res;
  });
}
