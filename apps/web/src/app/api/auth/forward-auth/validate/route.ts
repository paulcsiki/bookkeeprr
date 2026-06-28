import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { isCidrValid, isIpInCidrList } from '@/server/auth/forward-auth/cidr';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

const Body = z.object({
  trustedProxies: z.array(z.string()),
  userHeader: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const invalidCidrs = parsed.data.trustedProxies.filter((c) => !isCidrValid(c));
  if (invalidCidrs.length > 0) {
    return NextResponse.json(
      { ready: false, error: 'invalid_cidr', invalidCidrs },
      { status: 422 },
    );
  }

  const peer = extractProxyIp(req);
  const client = extractClientIp(req);
  const headerValue = req.headers.get(parsed.data.userHeader);

  const peerInTrustedProxies = peer !== null && isIpInCidrList(peer, parsed.data.trustedProxies);
  const userHeaderPresent = headerValue !== null && headerValue.length > 0;

  return NextResponse.json({
    ready: peerInTrustedProxies && userHeaderPresent,
    peerIp: peer,
    clientIp: client,
    peerInTrustedProxies,
    userHeaderName: parsed.data.userHeader,
    userHeaderPresent,
    userHeaderValue: headerValue,
  });
}
