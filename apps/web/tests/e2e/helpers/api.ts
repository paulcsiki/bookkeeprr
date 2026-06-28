import type { BrowserContext } from '@playwright/test';

const PORT = process.env.BOOKKEEPRR_E2E_PORT ?? '13000';
export const BASE = `http://localhost:${PORT}`;

export async function apiGet<T>(ctx: BrowserContext, path: string): Promise<T> {
  const cookies = await ctx.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const r = await fetch(`${BASE}${path}`, {
    headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : {},
  });
  if (!r.ok) {
    throw new Error(`apiGet ${path} → ${r.status} ${await r.text()}`);
  }
  return (await r.json()) as T;
}

export async function apiKeyDirect(path: string, key: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { headers: { 'x-api-key': key } });
}
