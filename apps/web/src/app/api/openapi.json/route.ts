import { NextResponse, type NextRequest } from 'next/server';
import { generateOpenApiDoc } from '@/server/openapi/generate';

// Pure + deterministic per process — build once. Servers are patched per
// request: the doc is served by the instance itself, so the request's own
// origin (forwarded headers first — the app usually sits behind a reverse
// proxy) is exactly the right base URL. Doc viewers then display the real
// host instead of a bare '/', and TryIt/curl samples target it. (The
// generator's default points at a placeholder localhost for the
// website-published copy.)
const doc = generateOpenApiDoc();

export async function GET(req: NextRequest): Promise<NextResponse> {
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const servers = host === null ? [{ url: '/' }] : [{ url: `${proto}://${host}` }];
  return NextResponse.json({ ...doc, servers });
}
