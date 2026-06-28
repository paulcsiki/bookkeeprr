import { UserRow, UsersResponse, AuthConfigResponse } from '@/api/schemas';

it('parses a UserRow', () => {
  const u = UserRow.parse({
    id: 1,
    username: 'paul',
    email: 'p@x',
    role: 'admin',
    source: 'local',
    disabled: false,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: '2026-05-26T08:00:00Z',
  });
  expect(u.role).toBe('admin');
});

it('parses UsersResponse', () => {
  const r = UsersResponse.parse({ users: [] });
  expect(r.users).toHaveLength(0);
});

it('maps the server authSource field onto source', () => {
  const r = UsersResponse.parse({
    users: [{ id: 1, username: 'a', role: 'admin', authSource: 'local', disabled: false }],
  });
  expect(r.users[0]?.source).toBe('local');
});

it('parses an AuthConfigResponse', () => {
  const r = AuthConfigResponse.parse({
    modes: [
      { kind: 'local', enabled: true, summary: 'Username + password' },
      { kind: 'oidc', enabled: true, summary: 'Authentik · authentik.example.com' },
      { kind: 'forward_auth', enabled: false, summary: 'Forward-auth header' },
    ],
  });
  expect(r.modes).toHaveLength(3);
});
