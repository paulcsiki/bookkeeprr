import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { fetchReleases, GitHubError } from '@/server/integrations/github/client';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 60_000;
let cache: { at: number; releases: unknown } | null = null;

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ releases: cache.releases, cached: true });
  }
  try {
    const releases = await fetchReleases(10);
    cache = { at: Date.now(), releases };
    return NextResponse.json({ releases, cached: false });
  } catch (err) {
    const message = err instanceof GitHubError ? `${err.code}: ${err.message}` : String(err);
    return NextResponse.json({ error: message, releases: [] }, { status: 502 });
  }
}
