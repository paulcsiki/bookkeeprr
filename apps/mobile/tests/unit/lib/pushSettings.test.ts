import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushSettings } from '@/lib/pushSettings';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('pushSettings', () => {
  it('returns defaults when nothing stored', async () => {
    const s = await pushSettings.get();
    expect(s).toEqual({ userOptedIn: false, registeredToken: null });
  });

  it('persists userOptedIn and registeredToken via setEnabled(true, token)', async () => {
    await pushSettings.setEnabled(true, 'fcm-token-xyz');
    expect(await pushSettings.get()).toEqual({
      userOptedIn: true,
      registeredToken: 'fcm-token-xyz',
    });
  });

  it('clears token on setEnabled(false)', async () => {
    await pushSettings.setEnabled(true, 'fcm-token-xyz');
    await pushSettings.setEnabled(false);
    expect(await pushSettings.get()).toEqual({
      userOptedIn: false,
      registeredToken: null,
    });
  });

  it('survives corrupted JSON by falling back to defaults', async () => {
    await AsyncStorage.setItem('push-settings/v1', '{not valid json');
    expect(await pushSettings.get()).toEqual({ userOptedIn: false, registeredToken: null });
  });
});
