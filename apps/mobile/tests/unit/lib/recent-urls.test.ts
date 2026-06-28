import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadRecentUrls, addRecentUrl, clearRecentUrls } from '@/lib/recent-urls';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('recent-urls', () => {
  it('load returns empty array when nothing stored', async () => {
    const urls = await loadRecentUrls();
    expect(urls).toEqual([]);
  });

  it('add stores a URL and load returns it', async () => {
    await addRecentUrl('https://server.example.com');
    const urls = await loadRecentUrls();
    expect(urls).toEqual(['https://server.example.com']);
  });

  it('add prepends new URLs so most-recent is first', async () => {
    await addRecentUrl('https://first.example.com');
    await addRecentUrl('https://second.example.com');
    const urls = await loadRecentUrls();
    expect(urls[0]).toBe('https://second.example.com');
    expect(urls[1]).toBe('https://first.example.com');
  });

  it('deduplicates by normalized URL (case-insensitive host)', async () => {
    await addRecentUrl('https://Server.Example.com');
    await addRecentUrl('https://server.example.com');
    const urls = await loadRecentUrls();
    expect(urls).toHaveLength(1);
    // most recent casing wins
    expect(urls[0]).toBe('https://server.example.com');
  });

  it('caps to 5 entries', async () => {
    for (let i = 1; i <= 7; i++) {
      await addRecentUrl(`https://host${i}.example.com`);
    }
    const urls = await loadRecentUrls();
    expect(urls).toHaveLength(5);
    // most recent first
    expect(urls[0]).toBe('https://host7.example.com');
    expect(urls[4]).toBe('https://host3.example.com');
  });

  it('clear removes all entries', async () => {
    await addRecentUrl('https://server.example.com');
    await clearRecentUrls();
    const urls = await loadRecentUrls();
    expect(urls).toEqual([]);
  });

  it('re-adding an existing URL moves it to the top', async () => {
    await addRecentUrl('https://a.example.com');
    await addRecentUrl('https://b.example.com');
    await addRecentUrl('https://a.example.com');
    const urls = await loadRecentUrls();
    expect(urls[0]).toBe('https://a.example.com');
    expect(urls[1]).toBe('https://b.example.com');
    expect(urls).toHaveLength(2);
  });
});
