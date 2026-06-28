/**
 * Internal re-export seam for `openid-client`.
 *
 * Production code in `src/server/auth/oidc/**` imports `discovery` and
 * `authorizationCodeGrant` from THIS module — never directly from
 * `'openid-client'`. The indirection lets the test harness (see
 * `./test-harness.ts`) install `vi.spyOn` mocks at runtime; spying directly on
 * the upstream ESM namespace fails with "Cannot redefine property" because
 * Node's ESM namespace objects are non-configurable.
 *
 * Type-only imports from `'openid-client'` are fine elsewhere (they don't
 * involve the runtime namespace), but any runtime call site goes through here.
 */
export { discovery, authorizationCodeGrant, buildAuthorizationUrl } from 'openid-client';
export type { Configuration } from 'openid-client';
