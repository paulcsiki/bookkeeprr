'use client';

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, init).then((res) => {
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
