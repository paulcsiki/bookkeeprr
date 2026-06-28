import { NextResponse } from 'next/server';
import { ApiKeyCreateBody as PostBody } from '@/server/openapi/schemas/auth';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { generateApiKey, listApiKeysForUser } from '@/server/db/api-keys';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

async function resolveUserId(
  req: Request,
): Promise<{ userId: number } | NextResponse> {
  const result = await authenticateRequest(req as Parameters<typeof authenticateRequest>[0]);
  if (result.kind !== 'authenticated' || result.actor === 'system') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return { userId: result.actor.userId };
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await resolveUserId(req);
  if (auth instanceof NextResponse) return auth;

  const keys = await listApiKeysForUser(auth.userId);
  return NextResponse.json({ keys });
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await resolveUserId(req);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = PostBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'name is required (1–100 chars)', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const generated = await generateApiKey(auth.userId, parsed.data.name);

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'apikey.create',
    target: { kind: 'apikey', id: String(generated.id) },
    metadata: { label: parsed.data.name },
    context: auditContext(req),
  });

  return NextResponse.json(generated, { status: 201 });
}
