/**
 * Per-device stable identity (DS11f — mobile).
 *
 * A UUID is generated on first call and persisted to AsyncStorage under
 * `device-id/v1`. Subsequent calls return the same value for the lifetime
 * of the app install.
 *
 * `getDeviceName()` uses `Platform.OS` to derive a human-readable label.
 * `expo-device` is NOT in deps, so we fall back to Platform.OS strings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = 'device-id/v1';

let _cachedId: string | null = null;

/**
 * Returns the stable device UUID for this installation.
 * Generates and persists a new UUID on first call.
 */
export async function getDeviceId(): Promise<string> {
  if (_cachedId !== null) return _cachedId;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      _cachedId = stored;
      return stored;
    }
    // Generate a UUID. React Native has crypto.getRandomValues via the
    // Hermes JS engine (v0.72+), so crypto.randomUUID() is available.
    const id = crypto.randomUUID();
    await AsyncStorage.setItem(STORAGE_KEY, id);
    _cachedId = id;
    return id;
  } catch {
    // AsyncStorage unavailable (e.g. test environment) — return empty string.
    return '';
  }
}

/**
 * Returns a human-readable label for this device.
 * Falls back to Platform.OS strings since expo-device is not in deps.
 */
export function getDeviceName(): string {
  switch (Platform.OS) {
    case 'ios':
      return 'your iPhone';
    case 'android':
      return 'your Android';
    default:
      return 'your device';
  }
}
