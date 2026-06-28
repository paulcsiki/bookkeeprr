import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { adoptImportRows } from '@/server/importer/adopt';
import { ImportAdoptBody } from '@/server/openapi/schemas/library-import';

export const dynamic = 'force-dynamic';

/**
 * POST /api/library/import — admin-only.
 *
 * Accepts a list of confirmed import rows (each pairing an on-disk ScanItem
 * with a chosen metadata Candidate), then creates the series record (or reuses
 * an existing one by provider id / title+contentType) and registers every file
 * as a library_file row.
 *
 * The operation is idempotent: re-running the same rows will create 0 new
 * library_file rows (already-tracked files are skipped). Returns the number of
 * newly inserted rows and the deduplicated list of series ids touched.
 *
 * 401/403 use the `{ message }` envelope.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: z.infer<typeof ImportAdoptBody>;
  try {
    body = ImportAdoptBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.message : 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const result = await adoptImportRows(body.rows);
  return NextResponse.json(result);
}
