import {
  reduceSetIdentity, reduceSetAvatar, shouldRefreshProfile,
  PROFILE_REFRESH_MIN_INTERVAL_MS,
  type ProfileState,
} from '@/state/profileStore';

const empty: ProfileState = {
  id: null, username: null, displayName: null, email: null,
  avatarUrl: null, avatarLocalPath: null, fetchedAt: 0,
};

it('reduceSetIdentity overwrites identity fields + stamps fetchedAt, pure', () => {
  const next = reduceSetIdentity(empty, {
    id: 7, username: 'paul', displayName: 'Alex Example',
    email: 'paul@example.com', avatarUrl: '/api/auth/me/avatar/7',
  }, 1000);
  expect(next).toMatchObject({
    id: 7, username: 'paul', displayName: 'Alex Example',
    email: 'paul@example.com', avatarUrl: '/api/auth/me/avatar/7', fetchedAt: 1000,
  });
  // Identity update never clobbers a previously-cached local image.
  expect(next.avatarLocalPath).toBe(empty.avatarLocalPath);
  expect(empty.id).toBeNull(); // original untouched
});

it('reduceSetAvatar sets only the local path (null clears)', () => {
  const withId = reduceSetIdentity(empty, { id: 1, username: 'a', displayName: null, email: null, avatarUrl: null }, 1);
  const next = reduceSetAvatar(withId, '/doc/profile/avatar');
  expect(next.avatarLocalPath).toBe('/doc/profile/avatar');
  expect(next.username).toBe('a'); // identity preserved
});

it('shouldRefreshProfile: never-fetched refreshes; otherwise throttles to once per 5 minutes', () => {
  const I = PROFILE_REFRESH_MIN_INTERVAL_MS;
  // A cached avatar so the avatar-missing exception (below) doesn't short-circuit
  // the throttle path under test here.
  const cached = { ...empty, avatarLocalPath: '/doc/avatar' };
  // Never fetched (fetchedAt === 0) → always refresh, regardless of `now`.
  expect(shouldRefreshProfile({ ...cached, fetchedAt: 0 }, 0)).toBe(true);
  expect(shouldRefreshProfile({ ...cached, fetchedAt: 0 }, 4 * 60_000)).toBe(true);
  // Just fetched (now === fetchedAt) → do NOT immediately re-refresh.
  expect(shouldRefreshProfile({ ...cached, fetchedAt: 1_000_000 }, 1_000_000)).toBe(false);
  // Less than the interval since the last fetch → throttle (no refresh).
  expect(shouldRefreshProfile({ ...cached, fetchedAt: 1_000_000 }, 1_000_000 + I - 1)).toBe(false);
  // At/over the interval → refresh.
  expect(shouldRefreshProfile({ ...cached, fetchedAt: 1_000_000 }, 1_000_000 + I)).toBe(true);
  // Clock moved backwards → never an immediate second refresh.
  expect(shouldRefreshProfile({ ...cached, fetchedAt: 1_000_000 }, 999_000)).toBe(false);
});

it('shouldRefreshProfile: a missing avatar always refreshes, even with a fresh identity', () => {
  // Identity fetched a moment ago but the avatar download failed (null cache) —
  // the throttle must NOT block the avatar-only retry.
  expect(shouldRefreshProfile({ ...empty, fetchedAt: 1_000_000, avatarLocalPath: null }, 1_000_001)).toBe(true);
  // With the avatar cached, the normal throttle applies again.
  expect(
    shouldRefreshProfile({ ...empty, fetchedAt: 1_000_000, avatarLocalPath: '/doc/avatar' }, 1_000_001),
  ).toBe(false);
});
