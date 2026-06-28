import { SETTINGS_NAV, settingsItemOffline } from '@/features/settings/settings-nav';

// The ONLY screens that are fully usable with no server: theme, the on-device
// downloads manager (+ the offline toggles it hosts), and the bundled changelog.
const LOCAL_KEYS = ['appearance', 'downloads', 'version'] as const;

const allItems = SETTINGS_NAV.flatMap((g) => g.items);

it('classifies exactly the three local screens as local; everything else server', () => {
  const local = allItems.filter((i) => settingsItemOffline(i) === 'local').map((i) => i.key).sort();
  expect(local).toEqual([...LOCAL_KEYS].sort());
});

it('every registry item resolves to local or server (fail-safe default)', () => {
  for (const i of allItems) {
    expect(['local', 'server']).toContain(settingsItemOffline(i));
  }
  // A future item that forgets the field defaults to server (gated), never undefined.
  expect(settingsItemOffline({ key: 'x', label: 'X', Icon: (() => null) as never, Component: () => null, status: 'native' })).toBe('server');
});

it('push is server even though it has no adminOnly flag', () => {
  const push = allItems.find((i) => i.key === 'push');
  expect(push).toBeDefined();
  expect(settingsItemOffline(push!)).toBe('server');
});
