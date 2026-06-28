import * as Keychain from 'react-native-keychain';

// Thin wrapper exposing the expo-secure-store API surface
// (getItemAsync / setItemAsync / deleteItemAsync) backed by
// react-native-keychain's generic-password store. The wrapper normalises
// keychain's `false` (no entry) to `null` so callers can rely on the
// same shape they did before the eject.

export async function getItemAsync(key: string): Promise<string | null> {
  const result = await Keychain.getGenericPassword({ service: key });
  if (result === false) return null;
  return result.password;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await Keychain.setGenericPassword(key, value, { service: key });
}

export async function deleteItemAsync(key: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: key });
}
