import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  pushNotification,
  loadNotificationHistory,
  clearNotificationHistory,
} from '@/push/notificationHistory';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('notificationHistory', () => {
  it('load returns empty array when nothing stored', async () => {
    const entries = await loadNotificationHistory();
    expect(entries).toEqual([]);
  });

  it('push stores an entry and load returns it', async () => {
    await pushNotification({ title: 'New release', body: 'Volume 5 imported.', receivedAt: 1000 });
    const entries = await loadNotificationHistory();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('New release');
    expect(entries[0]?.body).toBe('Volume 5 imported.');
    expect(entries[0]?.receivedAt).toBe(1000);
  });

  it('push prepends so newest is first', async () => {
    await pushNotification({ title: 'First', body: '', receivedAt: 1000 });
    await pushNotification({ title: 'Second', body: '', receivedAt: 2000 });
    const entries = await loadNotificationHistory();
    expect(entries[0]?.title).toBe('Second');
    expect(entries[1]?.title).toBe('First');
  });

  it('caps to 20 entries', async () => {
    for (let i = 0; i < 25; i++) {
      await pushNotification({ title: `Notif ${i}`, body: '', receivedAt: i });
    }
    const entries = await loadNotificationHistory();
    expect(entries).toHaveLength(20);
    // Most recent is notif 24
    expect(entries[0]?.title).toBe('Notif 24');
  });

  it('clear removes all entries', async () => {
    await pushNotification({ title: 'test', body: '', receivedAt: 1 });
    await clearNotificationHistory();
    const entries = await loadNotificationHistory();
    expect(entries).toEqual([]);
  });

  it('stores deepLink when provided', async () => {
    await pushNotification({
      title: 'Done',
      body: 'Imported.',
      receivedAt: 5000,
      deepLink: 'bookkeeprr://series/42',
    });
    const entries = await loadNotificationHistory();
    expect(entries[0]?.deepLink).toBe('bookkeeprr://series/42');
  });

  it('deepLink is optional', async () => {
    await pushNotification({ title: 'No link', body: '', receivedAt: 1 });
    const entries = await loadNotificationHistory();
    expect(entries[0]?.deepLink).toBeUndefined();
  });
});
