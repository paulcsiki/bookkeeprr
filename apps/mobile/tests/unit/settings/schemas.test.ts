import { OidcConfigResponse, OIDC_SECRET_SENTINEL } from '@/api/schemas/oidc-config';
import { ForwardAuthConfig } from '@/api/schemas/forward-auth-config';
import { ApiKeyState } from '@/api/schemas/api-key';
import { CreateUserResponse } from '@/api/schemas/users-mutate';

it('parses an OIDC config response and exposes the secret sentinel', () => {
  const parsed = OidcConfigResponse.parse({
    config: {
      enabled: true, issuer: 'https://i', clientId: 'c', clientSecret: '••••••••',
      scopes: ['openid'], buttonLabel: 'SSO', usernameClaim: 'preferred_username',
      emailClaim: 'email', groupsClaim: 'groups', allowedGroups: [], adminGroups: [],
      autoCreateUsers: true,
    },
  });
  expect(parsed.config.issuer).toBe('https://i');
  expect(OIDC_SECRET_SENTINEL).toBe('••••••••');
});

it('parses a forward-auth config', () => {
  const c = ForwardAuthConfig.parse({
    enabled: false, trustedProxies: ['10.0.0.0/8'], userHeader: 'Remote-User',
    emailHeader: 'Remote-Email', groupsHeader: 'Remote-Groups', autoCreateUsers: false,
    allowedGroups: [], adminGroups: [],
  });
  expect(c.userHeader).toBe('Remote-User');
});

it('parses api-key state', () => {
  expect(ApiKeyState.parse({ enabled: true, key: 'abc', createdAt: '2026-06-06T00:00:00Z' }).enabled).toBe(true);
});

it('parses create-user response', () => {
  expect(CreateUserResponse.parse({ user: { id: 5, username: 'x', role: 'user' } }).user.id).toBe(5);
});
