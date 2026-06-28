import { NextResponse } from 'next/server';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { getDb } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { withWriteLock } from '@/server/db/write-lock';
import { getMediaRoot } from '@/server/content-type/paths';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 1 * 1024 * 1024; // 1 MiB

function sniffMimeType(buf: Buffer): { ext: string; mime: string } | null {
  // PNG: 89 50 4E 47
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  // WebP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

async function tryResizeSharp(
  data: Buffer,
  destPath: string,
): Promise<boolean> {
  try {
    // Dynamic require so sharp remains an optional dependency. The
    // turbopackIgnore hint stops the Turbopack tracer from emitting
    // "Module not found: Can't resolve 'sharp'" when sharp isn't
    // present in node_modules at build time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const sharp: any = require(/* turbopackIgnore: true */ 'sharp');
    await sharp(data)
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .toFile(destPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveUserId(req: Request): Promise<{ userId: number } | NextResponse> {
  const result = await authenticateRequest(req as Parameters<typeof authenticateRequest>[0]);
  if (result.kind !== 'authenticated' || result.actor === 'system') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return { userId: result.actor.userId };
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await resolveUserId(req);
  if (auth instanceof NextResponse) return auth;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ message: 'Invalid multipart form data' }, { status: 400 });
  }

  // Find the file entry
  let file: File | null = null;
  for (const [, value] of formData.entries()) {
    if (value instanceof File) {
      file = value;
      break;
    }
  }

  if (file === null) {
    return NextResponse.json({ message: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { message: `File too large. Maximum size is ${MAX_BYTES / 1024} KiB` },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const data = Buffer.from(arrayBuffer);

  const typeInfo = sniffMimeType(data);
  if (typeInfo === null) {
    return NextResponse.json(
      { message: 'Unsupported file type. Only PNG, JPEG, and WebP are accepted' },
      { status: 415 },
    );
  }

  const mediaRoot = await getMediaRoot();
  const avatarDir = join(mediaRoot, 'avatars');
  await mkdir(avatarDir, { recursive: true });

  const fileName = `${auth.userId}.${typeInfo.ext}`;
  const destPath = join(avatarDir, fileName);

  // Try to resize with sharp; fall back to writing as-is
  const resized = await tryResizeSharp(data, destPath);
  if (!resized) {
    // Write directly
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(destPath);
      ws.on('finish', resolve);
      ws.on('error', reject);
      ws.write(data);
      ws.end();
    });
  }

  const relativePath = `avatars/${fileName}`;
  await withWriteLock(() =>
    getDb()
      .update(users)
      .set({ avatarPath: relativePath, updatedAt: new Date() })
      .where(eq(users.id, auth.userId)),
  );

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'avatar.update',
    target: { kind: 'user', id: String(auth.userId) },
    context: auditContext(req),
  });

  return NextResponse.json({
    avatarUrl: `/api/auth/me/avatar/${auth.userId}`,
  });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const auth = await resolveUserId(req);
  if (auth instanceof NextResponse) return auth;

  const [user] = await getDb()
    .select({ avatarPath: users.avatarPath })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  if (user?.avatarPath) {
    const mediaRoot = await getMediaRoot();
    const fullPath = join(mediaRoot, user.avatarPath);
    if (existsSync(fullPath)) {
      await unlink(fullPath).catch(() => { /* lenient */ });
    }
  }

  await withWriteLock(() =>
    getDb()
      .update(users)
      .set({ avatarPath: null, updatedAt: new Date() })
      .where(eq(users.id, auth.userId)),
  );

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'avatar.delete',
    target: { kind: 'user', id: String(auth.userId) },
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true });
}
