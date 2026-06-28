export function extractProxyIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff === null || xff.length === 0) return null;
  const parts = xff
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts[parts.length - 1] ?? null;
}

export function extractClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff === null || xff.length === 0) return null;
  const parts = xff
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts[0] ?? null;
}
