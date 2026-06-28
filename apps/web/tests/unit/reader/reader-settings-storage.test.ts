// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadReaderSettings,
  sanitizeReaderSettings,
  saveReaderSettings,
  saveReaderSettingsDebounced,
  SAVE_DEBOUNCE_MS,
} from '@/components/reader/lib/reader-settings-storage';

const KEY = (kind: string) => `bookkeeprr-reader-settings:${kind}`;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadReaderSettings / saveReaderSettings round-trip', () => {
  it('returns {} when nothing is stored', () => {
    expect(loadReaderSettings('text')).toEqual({});
  });

  it('round-trips a full text payload', () => {
    saveReaderSettings('text', {
      themeKey: 'sepia',
      auto: false,
      brightness: 0.8,
      warmth: 0.3,
      fontSize: 21,
      lineH: 1.7,
      font: 'mono',
      pageMode: 'scroll',
    });
    expect(loadReaderSettings('text')).toEqual({
      themeKey: 'sepia',
      auto: false,
      brightness: 0.8,
      warmth: 0.3,
      fontSize: 21,
      lineH: 1.7,
      font: 'mono',
      pageMode: 'scroll',
    });
  });

  it('round-trips audio rate + autoscroll', () => {
    saveReaderSettings('audio', { rate: 1.5, autoscroll: false });
    expect(loadReaderSettings('audio')).toEqual({ rate: 1.5, autoscroll: false });
  });

  it('merges patches instead of replacing the whole entry', () => {
    saveReaderSettings('comics', { themeKey: 'oled', auto: false });
    saveReaderSettings('comics', { spread: 'double' });
    expect(loadReaderSettings('comics')).toEqual({
      themeKey: 'oled',
      auto: false,
      spread: 'double',
    });
  });

  it('round-trips the comics reading direction', () => {
    saveReaderSettings('comics', { spread: 'single', dir: 'rtl' });
    expect(loadReaderSettings('comics')).toEqual({ spread: 'single', dir: 'rtl' });
    saveReaderSettings('comics', { dir: 'ltr' });
    expect(loadReaderSettings('comics')).toEqual({ spread: 'single', dir: 'ltr' });
  });

  it('drops an unknown reading direction value', () => {
    expect(sanitizeReaderSettings({ dir: 'sideways' })).toEqual({});
  });

  it('keeps kinds isolated under their own keys', () => {
    saveReaderSettings('text', { fontSize: 24 });
    saveReaderSettings('comics', { spread: 'webtoon' });
    expect(loadReaderSettings('text')).toEqual({ fontSize: 24 });
    expect(loadReaderSettings('comics')).toEqual({ spread: 'webtoon' });
    expect(window.localStorage.getItem(KEY('text'))).toBeTruthy();
    expect(window.localStorage.getItem(KEY('comics'))).toBeTruthy();
    expect(window.localStorage.getItem(KEY('audio'))).toBeNull();
  });
});

describe('corrupt payloads', () => {
  it('returns {} for non-JSON garbage', () => {
    window.localStorage.setItem(KEY('text'), 'not json {{{');
    expect(loadReaderSettings('text')).toEqual({});
  });

  it('returns {} for JSON that is not an object', () => {
    window.localStorage.setItem(KEY('text'), JSON.stringify([1, 2, 3]));
    expect(loadReaderSettings('text')).toEqual({});
    window.localStorage.setItem(KEY('text'), JSON.stringify(null));
    expect(loadReaderSettings('text')).toEqual({});
    window.localStorage.setItem(KEY('text'), JSON.stringify('sepia'));
    expect(loadReaderSettings('text')).toEqual({});
  });

  it('drops fields of the wrong type and unknown enum values', () => {
    window.localStorage.setItem(
      KEY('text'),
      JSON.stringify({
        themeKey: 'hotpink',
        auto: 'yes',
        brightness: '0.5',
        fontSize: null,
        font: 'wingdings',
        pageMode: 7,
        injected: 'field',
      }),
    );
    expect(loadReaderSettings('text')).toEqual({});
  });

  it('drops NaN / Infinity numerics', () => {
    expect(
      sanitizeReaderSettings({ brightness: NaN, warmth: Infinity, rate: -Infinity }),
    ).toEqual({});
  });

  it('keeps valid fields next to invalid ones', () => {
    window.localStorage.setItem(
      KEY('comics'),
      JSON.stringify({ themeKey: 'dark', spread: 'sideways', auto: true }),
    );
    expect(loadReaderSettings('comics')).toEqual({ themeKey: 'dark', auto: true });
  });
});

describe('clamping', () => {
  it('clamps brightness and warmth to 0..1', () => {
    expect(sanitizeReaderSettings({ brightness: 5, warmth: -2 })).toEqual({
      brightness: 1,
      warmth: 0,
    });
  });

  it('clamps fontSize to 13..28 and lineH to 1.3..2.2', () => {
    expect(sanitizeReaderSettings({ fontSize: 100, lineH: 0.1 })).toEqual({
      fontSize: 28,
      lineH: 1.3,
    });
    expect(sanitizeReaderSettings({ fontSize: 1, lineH: 9 })).toEqual({
      fontSize: 13,
      lineH: 2.2,
    });
  });

  it('clamps rate to 0.5..3', () => {
    expect(sanitizeReaderSettings({ rate: 0.1 })).toEqual({ rate: 0.5 });
    expect(sanitizeReaderSettings({ rate: 99 })).toEqual({ rate: 3 });
  });

  it('clamps out-of-range stored values on load', () => {
    window.localStorage.setItem(KEY('text'), JSON.stringify({ fontSize: 999, brightness: 2 }));
    expect(loadReaderSettings('text')).toEqual({ fontSize: 28, brightness: 1 });
  });
});

describe('blocked storage (Safari private mode)', () => {
  it('load returns {} when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadReaderSettings('text')).toEqual({});
  });

  it('save does not throw when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveReaderSettings('text', { fontSize: 20 })).not.toThrow();
  });
});

describe('saveReaderSettingsDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('does not write until the debounce window elapses', () => {
    saveReaderSettingsDebounced('text', { brightness: 0.7 });
    expect(window.localStorage.getItem(KEY('text'))).toBeNull();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(loadReaderSettings('text')).toEqual({ brightness: 0.7 });
  });

  it('coalesces rapid patches into a single final write', () => {
    saveReaderSettingsDebounced('text', { brightness: 0.2 });
    vi.advanceTimersByTime(100);
    saveReaderSettingsDebounced('text', { brightness: 0.4 });
    vi.advanceTimersByTime(100);
    saveReaderSettingsDebounced('text', { warmth: 0.5 });
    // The window restarts on each call — nothing written yet.
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(window.localStorage.getItem(KEY('text'))).toBeNull();
    vi.advanceTimersByTime(1);
    expect(loadReaderSettings('text')).toEqual({ brightness: 0.4, warmth: 0.5 });
  });

  it('an immediate save flushes the pending debounced patch', () => {
    saveReaderSettingsDebounced('text', { warmth: 0.6 });
    saveReaderSettings('text', { themeKey: 'dark', auto: false });
    // Both land at once; the discrete pick wins over older pending values.
    expect(loadReaderSettings('text')).toEqual({
      warmth: 0.6,
      themeKey: 'dark',
      auto: false,
    });
    // Nothing further fires after the window — the pending timer was cleared.
    window.localStorage.clear();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(window.localStorage.getItem(KEY('text'))).toBeNull();
  });

  it('debounces per kind independently', () => {
    saveReaderSettingsDebounced('text', { brightness: 0.9 });
    saveReaderSettingsDebounced('comics', { warmth: 0.1 });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(loadReaderSettings('text')).toEqual({ brightness: 0.9 });
    expect(loadReaderSettings('comics')).toEqual({ warmth: 0.1 });
  });
});
