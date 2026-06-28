import * as SecureStore from '@/lib/secure-storage';
import { useChangelogStore } from '@/state/changelogStore';

beforeEach(() => {
  jest.clearAllMocks();
  useChangelogStore.setState({ lastSeen: null, hydrated: false });
});

it('hydrate reads from secure-store and sets value', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('0.1.0');
  await useChangelogStore.getState().hydrate();
  expect(useChangelogStore.getState().lastSeen).toBe('0.1.0');
  expect(useChangelogStore.getState().hydrated).toBe(true);
});

it('hydrate without stored value leaves lastSeen null', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
  await useChangelogStore.getState().hydrate();
  expect(useChangelogStore.getState().lastSeen).toBeNull();
  expect(useChangelogStore.getState().hydrated).toBe(true);
});

it('setLastSeen writes to secure-store', async () => {
  await useChangelogStore.getState().setLastSeen('0.2.0');
  expect(useChangelogStore.getState().lastSeen).toBe('0.2.0');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'bookkeeprr.changelog.lastSeen.v1',
    '0.2.0',
  );
});
