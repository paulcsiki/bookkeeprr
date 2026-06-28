import {
  reduceDeviceOnline, reduceServerReachable, reduceMarkPing,
  deriveIsOnline, shouldPing, type ConnectivityState,
} from '@/state/connectivityStore';

const base: ConnectivityState = { deviceOnline: true, serverReachable: null, lastPingAt: 0 };

it('derives online when device up and server not-confirmed-down', () => {
  expect(deriveIsOnline(base)).toBe(true);
  expect(deriveIsOnline({ ...base, serverReachable: true })).toBe(true);
  expect(deriveIsOnline({ ...base, serverReachable: false })).toBe(false);
  expect(deriveIsOnline({ ...base, deviceOnline: false })).toBe(false);
});

it('reducers update one field each and are pure', () => {
  expect(reduceDeviceOnline(base, false)).toEqual({ ...base, deviceOnline: false });
  expect(reduceServerReachable(base, false)).toEqual({ ...base, serverReachable: false });
  expect(reduceMarkPing(base, 1234)).toEqual({ ...base, lastPingAt: 1234 });
  expect(base.deviceOnline).toBe(true);
});

it('throttles pings to once per 75s', () => {
  expect(shouldPing({ ...base, lastPingAt: 0 }, 80_000)).toBe(true);
  expect(shouldPing({ ...base, lastPingAt: 80_000 }, 100_000)).toBe(false);
  expect(shouldPing({ ...base, lastPingAt: 80_000 }, 160_000)).toBe(true);
});
