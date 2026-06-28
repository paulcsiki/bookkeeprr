const MOCK_PORT = process.env.MOCK_OAUTH_PORT ?? '18080';
const BASE = `http://localhost:${MOCK_PORT}`;

export type OidcClaimOverride = {
  sub?: string;
  preferred_username?: string;
  email?: string;
  groups?: string[];
  [key: string]: unknown;
};

export async function configureMockOAuth(claims: OidcClaimOverride): Promise<void> {
  const r = await fetch(`${BASE}/bookkeeprr/setup`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tokenCallbacks: [
        {
          issuerId: 'bookkeeprr',
          tokenExpiry: 3600,
          requestMappings: [{ requestParam: 'scope', match: 'openid', claims }],
        },
      ],
    }),
  });
  if (!r.ok) {
    throw new Error(`mock-oauth setup failed: ${r.status} ${await r.text()}`);
  }
}
