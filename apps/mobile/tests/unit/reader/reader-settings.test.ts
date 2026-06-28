import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadReaderSettings,
  saveReaderSettings,
  flushReaderSettings,
} from '@/features/reader/lib/reader-settings';

beforeEach(() => AsyncStorage.clear());

afterEach(async () => {
  await flushReaderSettings();
  jest.useRealTimers();
});

it('returns an empty bundle for never-set', async () => {
  expect(await loadReaderSettings('text')).toEqual({});
});

it('round-trips a saved bundle', async () => {
  saveReaderSettings('text', { themeKey: 'sepia', fontScale: 1.2 });
  await flushReaderSettings();
  expect(await loadReaderSettings('text')).toEqual({ themeKey: 'sepia', fontScale: 1.2 });
});

it('keeps each reader kind in its own bucket', async () => {
  saveReaderSettings('comics', { themeKey: 'oled' });
  saveReaderSettings('text', { themeKey: 'sepia' });
  saveReaderSettings('audio', { rate: 1.5 });
  await flushReaderSettings();
  expect(await loadReaderSettings('comics')).toEqual({ themeKey: 'oled' });
  expect(await loadReaderSettings('text')).toEqual({ themeKey: 'sepia' });
  expect(await loadReaderSettings('audio')).toEqual({ rate: 1.5 });
});

it('round-trips the comics spread, direction, and text scroll mode', async () => {
  saveReaderSettings('comics', { spread: 'webtoon', direction: 'rtl' });
  saveReaderSettings('text', { scrollMode: true });
  await flushReaderSettings();
  expect(await loadReaderSettings('comics')).toEqual({ spread: 'webtoon', direction: 'rtl' });
  expect(await loadReaderSettings('text')).toEqual({ scrollMode: true });
});

it('drops unknown spread / direction enum values on load', async () => {
  await AsyncStorage.setItem(
    'bookkeeprr-reader-settings:comics',
    JSON.stringify({ spread: 'sideways', direction: 'diagonal', scrollMode: 'yes' }),
  );
  expect(await loadReaderSettings('comics')).toEqual({});
});

it('merges partial saves over the stored bundle', async () => {
  saveReaderSettings('comics', { brightness: 0.7 });
  await flushReaderSettings();
  saveReaderSettings('comics', { warmth: 0.3 });
  await flushReaderSettings();
  expect(await loadReaderSettings('comics')).toEqual({ brightness: 0.7, warmth: 0.3 });
});

it('returns an empty bundle for a corrupt blob', async () => {
  await AsyncStorage.setItem('bookkeeprr-reader-settings:text', 'not json');
  expect(await loadReaderSettings('text')).toEqual({});
});

it('returns an empty bundle for non-object JSON', async () => {
  await AsyncStorage.setItem('bookkeeprr-reader-settings:text', JSON.stringify([1, 2]));
  expect(await loadReaderSettings('text')).toEqual({});
});

it('drops unknown theme keys and wrong-typed fields on load', async () => {
  await AsyncStorage.setItem(
    'bookkeeprr-reader-settings:text',
    JSON.stringify({ themeKey: 'neon', auto: 'yes', brightness: 'high', junk: true }),
  );
  expect(await loadReaderSettings('text')).toEqual({});
});

it('clamps out-of-range numbers to their UI ranges', async () => {
  await AsyncStorage.setItem(
    'bookkeeprr-reader-settings:audio',
    JSON.stringify({ brightness: 5, warmth: -2, fontScale: 99, rate: 0.1 }),
  );
  expect(await loadReaderSettings('audio')).toEqual({
    brightness: 1,
    warmth: 0,
    fontScale: 1.6,
    rate: 0.75,
  });
});

it('drops non-finite numbers', async () => {
  await AsyncStorage.setItem(
    'bookkeeprr-reader-settings:text',
    // JSON has no NaN/Infinity literals; null is the closest stale-data shape.
    JSON.stringify({ brightness: null, fontScale: 1.2 }),
  );
  expect(await loadReaderSettings('text')).toEqual({ fontScale: 1.2 });
});

it('debounces rapid saves into a single write with the final values', async () => {
  jest.useFakeTimers();
  const setSpy = jest.spyOn(AsyncStorage, 'setItem');
  // A brightness slider drag: many per-frame updates.
  for (let i = 0; i <= 10; i++) {
    saveReaderSettings('comics', { brightness: i / 10 });
  }
  expect(setSpy).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(500);
  expect(setSpy).toHaveBeenCalledTimes(1);
  expect(setSpy).toHaveBeenCalledWith(
    'bookkeeprr-reader-settings:comics',
    JSON.stringify({ brightness: 1 }),
  );
  setSpy.mockRestore();
});
