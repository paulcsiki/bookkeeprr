import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { resolveNuSlug, type NuResolveResult } from '@/server/integrations/novelupdates/resolve';
import { logger } from '@/server/logger';

export const dynamic = 'force-dynamic';

const PostBody = z.object({
  title: z.string().min(1).max(500),
  altTitles: z.array(z.string().max(500)).max(20).default([]),
});

/**
 * 10s upstream-call budget. NU is rate-limited to ~1 req per 3s; the helper
 * issues a single search, so 10s is generous. Exported for tests so the
 * timeout can be driven deterministically by fake timers.
 */
export const TIMEOUT_MS = 10_000;

const NO_MATCH: NuResolveResult = { match: 'none', slug: null, candidateTitle: null };

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<NuResolveResult>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(NO_MATCH), TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([resolveNuSlug(parsed.data), timeout]);
    return NextResponse.json(result);
  } catch (err) {
    logger().warn({ err }, 'resolveNuSlug failed; silently degrading to no-match');
    return NextResponse.json(NO_MATCH);
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }
}
