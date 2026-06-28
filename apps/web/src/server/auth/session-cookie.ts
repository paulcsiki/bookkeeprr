import type { NextResponse } from 'next/server';

const COOKIE_NAME = 'bookkeeprr_session';
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function isSecureRequest(req: Request): boolean {
  if (req.url.startsWith('https://')) return true;
  const xfp = req.headers.get('x-forwarded-proto');
  return xfp === 'https';
}

function serializeCookie(opts: {
  name: string;
  value: string;
  maxAge: number;
  secure: boolean;
}): string {
  // Hand-rolled serializer to guarantee canonical casing (`SameSite=Lax`, `HttpOnly`).
  // Next's res.cookies.set lowercases the SameSite value, which downstream code and tests
  // may inspect via string match.
  const parts = [
    `${opts.name}=${opts.value}`,
    'Path=/',
    `Max-Age=${opts.maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookie(res: NextResponse, token: string, req: Request): void {
  res.headers.append(
    'set-cookie',
    serializeCookie({
      name: COOKIE_NAME,
      value: token,
      maxAge: COOKIE_MAX_AGE_SECONDS,
      secure: isSecureRequest(req),
    }),
  );
}

export function clearSessionCookie(res: NextResponse): void {
  res.headers.append(
    'set-cookie',
    serializeCookie({
      name: COOKIE_NAME,
      value: '',
      maxAge: 0,
      secure: false,
    }),
  );
}

export function readSessionCookie(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader === null) return null;
  const parts = cookieHeader.split(';').map((s) => s.trim());
  for (const part of parts) {
    if (part.startsWith(`${COOKIE_NAME}=`)) {
      return part.slice(COOKIE_NAME.length + 1);
    }
  }
  return null;
}
