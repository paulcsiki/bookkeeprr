import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export interface OfflineSettings {
  autoDownloadNext: boolean;
  wifiOnly: boolean;
}

const KEY = 'reader/offline-settings/v1';
const DEFAULTS: OfflineSettings = { autoDownloadNext: true, wifiOnly: true };

export async function loadOfflineSettings(): Promise<OfflineSettings> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Partial<OfflineSettings>;
      return {
        autoDownloadNext: typeof p.autoDownloadNext === 'boolean' ? p.autoDownloadNext : DEFAULTS.autoDownloadNext,
        wifiOnly: typeof p.wifiOnly === 'boolean' ? p.wifiOnly : DEFAULTS.wifiOnly,
      };
    }
  } catch {
    /* fall through */
  }
  return { ...DEFAULTS };
}

export async function saveOfflineSettings(next: OfflineSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export function useOfflineSettings(): {
  settings: OfflineSettings;
  setAutoDownloadNext: (v: boolean) => void;
  setWifiOnly: (v: boolean) => void;
} {
  const [settings, setSettings] = useState<OfflineSettings>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    loadOfflineSettings().then((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(patch: Partial<OfflineSettings>): void {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveOfflineSettings(next).catch(() => {
        /* best-effort persistence */
      });
      return next;
    });
  }

  return {
    settings,
    setAutoDownloadNext: (v) => update({ autoDownloadNext: v }),
    setWifiOnly: (v) => update({ wifiOnly: v }),
  };
}
