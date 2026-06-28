import { NextResponse } from 'next/server';
import { checkPath, resolveFirstRunPaths } from '@/server/first-run/paths';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const candidate = url.searchParams.get('mediaRoot');
  const base = await resolveFirstRunPaths();
  if (candidate !== null && candidate.length > 0) {
    return NextResponse.json({ ...base, mediaRoot: { path: candidate, status: checkPath(candidate) } });
  }
  return NextResponse.json(base);
}
