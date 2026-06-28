import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadOfflineSettings, saveOfflineSettings } from '@/features/reader/lib/offline-settings';

beforeEach(() => AsyncStorage.clear());

it('returns defaults for never-set', async () => {
  expect(await loadOfflineSettings()).toEqual({ autoDownloadNext: true, wifiOnly: true });
});

it('round-trips', async () => {
  await saveOfflineSettings({ autoDownloadNext: false, wifiOnly: false });
  expect(await loadOfflineSettings()).toEqual({ autoDownloadNext: false, wifiOnly: false });
});

it('falls back to defaults for corrupt blob', async () => {
  await AsyncStorage.setItem('reader/offline-settings/v1', 'not json');
  expect(await loadOfflineSettings()).toEqual({ autoDownloadNext: true, wifiOnly: true });
});

it('falls back individual keys to defaults for partial object', async () => {
  await AsyncStorage.setItem('reader/offline-settings/v1', JSON.stringify({ autoDownloadNext: false }));
  const result = await loadOfflineSettings();
  expect(result.autoDownloadNext).toBe(false);
  expect(result.wifiOnly).toBe(true); // default
});
