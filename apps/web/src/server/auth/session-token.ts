import { randomBytes, timingSafeEqual } from 'node:crypto';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function compareTokens(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
