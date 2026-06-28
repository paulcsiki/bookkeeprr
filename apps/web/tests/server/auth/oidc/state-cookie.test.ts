import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  signOidcPendingCookie,
  parseOidcPendingCookie,
  type OidcPendingPayload,
} from '@/server/auth/oidc/state-cookie';

const payload: OidcPendingPayload = {
  codeVerifier: 'verifier-abc',
  state: 'state-xyz',
  nonce: 'nonce-123',
  issuer: 'https://idp.example.com/',
  next: '/library',
};

describe('OIDC pending cookie', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('round-trips a signed payload', async () => {
    const signed = await signOidcPendingCookie(payload);
    const parsed = await parseOidcPendingCookie(signed);
    expect(parsed).toEqual(payload);
  });

  it('rejects a tampered payload', async () => {
    const signed = await signOidcPendingCookie(payload);
    // Flip the first character of the signature suffix to something
    // guaranteed different from the original. Picking a fixed letter
    // (e.g. 'A') made the test flaky ~1.6% of runs when the signature
    // already started with that letter (base64url = 64 chars, 1/64).
    const idx = signed.lastIndexOf('.');
    const original = signed[idx + 1];
    const replacement = original === 'A' ? 'B' : 'A';
    const tampered = signed.slice(0, idx) + '.' + replacement + signed.slice(idx + 2);
    const parsed = await parseOidcPendingCookie(tampered);
    expect(parsed).toBe(null);
  });

  it('returns null for completely bogus input', async () => {
    expect(await parseOidcPendingCookie('not-a-cookie')).toBe(null);
    expect(await parseOidcPendingCookie('')).toBe(null);
  });
});
