// AsyncStorage-backed rolling buffer of the last 20 push notifications received.
// Entries are stored newest-first. Consumed by PushNotifications.tsx to show a
// "RECENT NOTIFICATIONS" list when push is enabled.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'push/notification-history/v1';
const MAX_ENTRIES = 20;

export interface NotificationHistoryEntry {
  title: string;
  body: string;
  receivedAt: number;
  deepLink?: string;
}

/** Prepends a notification entry to the rolling 20-item buffer. */
export async function pushNotification(
  notif: NotificationHistoryEntry,
): Promise<void> {
  const current = await loadNotificationHistory();
  const next = [notif, ...current].slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

/** Returns stored notifications, newest first. */
export async function loadNotificationHistory(): Promise<NotificationHistoryEntry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Clears all stored notification history. */
export async function clearNotificationHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

function isValidEntry(v: unknown): v is NotificationHistoryEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.title === 'string' &&
    typeof e.body === 'string' &&
    typeof e.receivedAt === 'number'
  );
}
