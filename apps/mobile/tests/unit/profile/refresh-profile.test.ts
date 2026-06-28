import { md5 } from 'js-md5';
import { refreshProfile } from '@/state/refreshProfile';
import { useProfile } from '@/state/profileStore';
import { useConnectivity } from '@/state/connectivityStore';
import { createApiClient } from '@/api/client';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { __resetBlobUtil, __setExists } from '../../mocks/blob-util';

jest.mock('@/api/client', () => ({
  createApiClient: jest.fn(),
}));
const mockCreate = createApiClient as jest.MockedFunction<typeof createApiClient>;

type Me = {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  role: 'admin' | 'user';
  avatarUrl: string | null;
};

function mockMe(me: Me): void {
  mockCreate.mockReturnValue({
    get: jest.fn(async () => me),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  } as never);
}

const creds = {
  serverUrl: 'https://srv',
  token: 'tok',
  refreshToken: '',
  expiresAt: '',
  certFingerprint: null,
};

// DocumentDir in the blob-util mock is '/mock/Documents'.
const MOCK_DOC_DIR = ReactNativeBlobUtil.fs.dirs.DocumentDir; // '/mock/Documents'

/** A fetchAvatar stub that returns the save path it received (simulates a successful download). */
const stubFetchAvatar = jest.fn(async (_url: string, _headers: Record<string, string>, savePath: string) => savePath);

beforeEach(() => {
  jest.clearAllMocks();
  __resetBlobUtil();
  useProfile.setState({
    id: null, username: null, displayName: null, email: null,
    avatarUrl: null, avatarLocalPath: null, fetchedAt: 0,
  });
  useConnectivity.setState({ deviceOnline: true, serverReachable: true, lastPingAt: 0 });
});

it('downloads the server avatar and caches identity', async () => {
  mockMe({ id: 7, username: 'paul', displayName: 'Alex', email: 'p@x.io', role: 'user', avatarUrl: '/api/auth/me/avatar/7' });

  await refreshProfile(creds, { now: () => 1000, fetchAvatar: stubFetchAvatar });

  const p = useProfile.getState();
  expect(p.username).toBe('paul');
  expect(p.displayName).toBe('Alex');
  expect(p.email).toBe('p@x.io');
  expect(p.fetchedAt).toBe(1000);
  // After the fix, avatarLocalPath is stored RELATIVE to DocumentDir.
  expect(p.avatarLocalPath).toBe('profile/avatar');
  // The avatar fetch targeted the bearer-authed absolute server route.
  expect(stubFetchAvatar).toHaveBeenCalledWith(
    'https://srv/api/auth/me/avatar/7',
    { Authorization: 'Bearer tok' },
    expect.any(String),
  );
});

it('falls back to a d=404 Gravatar (MD5 of the email) when no server avatar', async () => {
  mockMe({ id: 7, username: 'paul', displayName: 'Alex', email: 'p@x.io', role: 'user', avatarUrl: null });

  await refreshProfile(creds, { now: () => 1, fetchAvatar: stubFetchAvatar });

  const expected = `https://www.gravatar.com/avatar/${md5('p@x.io')}?d=404&s=160`;
  expect(stubFetchAvatar).toHaveBeenCalledWith(expected, {}, expect.any(String));
  // Stored as a relative path.
  expect(useProfile.getState().avatarLocalPath).toBe('profile/avatar');
});

it('leaves the prior cached avatar intact when the download fails (best-effort)', async () => {
  mockMe({ id: 7, username: 'paul', displayName: 'Alex', email: 'p@x.io', role: 'user', avatarUrl: null });
  // Stored path is relative (new format). The blob-util mock reports it NOT existing
  // (default), so the self-heal path will attempt a re-download that then fails.
  useProfile.setState({ avatarLocalPath: 'profile/avatar' });
  const failFetch = jest.fn(async () => { throw new Error('404'); });

  await refreshProfile(creds, { now: () => 1, fetchAvatar: failFetch });

  // Identity still updates; the avatar cache is NOT cleared on a failed re-download.
  expect(useProfile.getState().username).toBe('paul');
  expect(useProfile.getState().avatarLocalPath).toBe('profile/avatar');
});

it('is a no-op offline (no fetch, prior cache stands)', async () => {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
  useProfile.setState({ avatarLocalPath: 'profile/avatar' });

  await refreshProfile(creds, { now: () => 1, fetchAvatar: stubFetchAvatar });

  expect(mockCreate).not.toHaveBeenCalled();
  expect(stubFetchAvatar).not.toHaveBeenCalled();
  expect(useProfile.getState().avatarLocalPath).toBe('profile/avatar');
});

it('re-resolves the avatar when the cache is empty even if the identity is fresh', async () => {
  // Identity was fetched a moment ago (fresh stamp) but the avatar download had
  // previously failed → avatarLocalPath is null. A fresh-identity throttle must
  // NOT stop the avatar from being (re)resolved.
  mockMe({ id: 7, username: 'paul', displayName: 'Alex', email: 'p@x.io', role: 'user', avatarUrl: null });
  useProfile.setState({ fetchedAt: 1_000, avatarLocalPath: null });

  // shouldRefreshProfile returns true while the avatar is missing, so the caller
  // would invoke refreshProfile; here we assert refreshProfile resolves the avatar.
  await refreshProfile(creds, { now: () => 1_100, fetchAvatar: stubFetchAvatar });

  expect(stubFetchAvatar).toHaveBeenCalledTimes(1);
  // Stored as relative path.
  expect(useProfile.getState().avatarLocalPath).toBe('profile/avatar');
});

it('keeps the cache when /api/mobile/me fails (transient)', async () => {
  mockCreate.mockReturnValue({
    get: jest.fn(async () => { throw new Error('boom'); }),
    post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(),
  } as never);
  useProfile.setState({ username: 'cached', avatarLocalPath: 'profile/avatar' });

  await refreshProfile(creds, { now: () => 1, fetchAvatar: stubFetchAvatar });

  expect(stubFetchAvatar).not.toHaveBeenCalled();
  expect(useProfile.getState().username).toBe('cached');
  expect(useProfile.getState().avatarLocalPath).toBe('profile/avatar');
});

it('always re-downloads the avatar when online (restores freshness; subsumes the self-heal)', async () => {
  // The server avatar URL is stable even when bytes change, so there is no URL
  // signal to detect a changed avatar. Always re-downloading on each
  // throttle-allowed refresh ensures the device stays in sync when the user
  // changes their avatar server-side. A missing file (e.g. after a UUID rotation)
  // is equally handled: the file is simply re-downloaded on the next refresh.
  mockMe({ id: 7, username: 'paul', displayName: 'Alex', email: 'p@x.io', role: 'user', avatarUrl: null });
  const absolutePath = `${MOCK_DOC_DIR}/profile/avatar`;
  useProfile.setState({ fetchedAt: 1_000, avatarLocalPath: 'profile/avatar' });
  // Even when the file exists on disk, we always re-download.
  __setExists(absolutePath, true);

  await refreshProfile(creds, { now: () => 1_100, fetchAvatar: stubFetchAvatar });

  // Always re-downloads — no skip-when-exists logic.
  expect(stubFetchAvatar).toHaveBeenCalledTimes(1);
  expect(useProfile.getState().avatarLocalPath).toBe('profile/avatar');
});
