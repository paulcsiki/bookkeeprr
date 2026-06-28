import AsyncStorage from '@react-native-async-storage/async-storage';
import { READER_THEME_KEYS, type ReaderThemeKey } from '@/theme/reader-themes';

/**
 * Per-device reader-settings persistence, keyed by READER KIND (not content
 * type): a manga reader stays OLED while a novel reader stays sepia. The
 * content-type seeds in the Reader shell remain the fallback for first use —
 * a key is only ever written once the user changes a setting.
 *
 * Values are validated on load (numbers clamped to their UI ranges, unknown
 * theme keys dropped) so corrupt or stale JSON can never crash a reader.
 * Writes are merged + debounced (~500ms) so brightness/warmth slider drags
 * don't hit AsyncStorage per-frame.
 */
export type ReaderSettingsKind = 'comics' | 'text' | 'audio';

export interface ReaderSettings {
  /** Explicitly chosen reader theme (absent = use the content-type seed). */
  themeKey?: ReaderThemeKey;
  /** Whether the theme follows the OS color scheme. */
  auto?: boolean;
  /** Screen dimming, 0..1 (1 = full brightness). */
  brightness?: number;
  /** Warm-light overlay strength, 0..1. */
  warmth?: number;
  /** Text-reader font scale, 0.8..1.6. */
  fontScale?: number;
  /** Text-reader paged-vs-scroll flow (true = scroll). */
  scrollMode?: boolean;
  /** Comics-reader page layout. */
  spread?: 'single' | 'spread' | 'webtoon';
  /** Comics-reader page-turn direction. */
  direction?: 'ltr' | 'rtl';
  /** Audio playback rate, 0.75..2. */
  rate?: number;
}

const SPREADS: readonly string[] = ['single', 'spread', 'webtoon'];
const DIRECTIONS: readonly string[] = ['ltr', 'rtl'];

const keyFor = (kind: ReaderSettingsKind) => `bookkeeprr-reader-settings:${kind}`;

const WRITE_DEBOUNCE_MS = 500;

function clamp(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, v));
}

/** Keep only known fields with valid values; drop everything else. */
function sanitize(raw: unknown): ReaderSettings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const p = raw as Record<string, unknown>;
  const out: ReaderSettings = {};
  if (
    typeof p.themeKey === 'string' &&
    (READER_THEME_KEYS as readonly string[]).includes(p.themeKey)
  ) {
    out.themeKey = p.themeKey as ReaderThemeKey;
  }
  if (typeof p.auto === 'boolean') out.auto = p.auto;
  const brightness = clamp(p.brightness, 0, 1);
  if (brightness !== undefined) out.brightness = brightness;
  const warmth = clamp(p.warmth, 0, 1);
  if (warmth !== undefined) out.warmth = warmth;
  const fontScale = clamp(p.fontScale, 0.8, 1.6);
  if (fontScale !== undefined) out.fontScale = fontScale;
  if (typeof p.scrollMode === 'boolean') out.scrollMode = p.scrollMode;
  if (typeof p.spread === 'string' && SPREADS.includes(p.spread)) {
    out.spread = p.spread as NonNullable<ReaderSettings['spread']>;
  }
  if (typeof p.direction === 'string' && DIRECTIONS.includes(p.direction)) {
    out.direction = p.direction as NonNullable<ReaderSettings['direction']>;
  }
  const rate = clamp(p.rate, 0.75, 2);
  if (rate !== undefined) out.rate = rate;
  return out;
}

export async function loadReaderSettings(kind: ReaderSettingsKind): Promise<ReaderSettings> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(kind));
    if (raw === null) return {};
    return sanitize(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

// Per-kind pending patches + debounce timers. Patches accumulate (merge) while
// the timer is pending, then flush merges them over the stored bundle.
const pending = new Map<ReaderSettingsKind, ReaderSettings>();
const timers = new Map<ReaderSettingsKind, ReturnType<typeof setTimeout>>();

async function flush(kind: ReaderSettingsKind): Promise<void> {
  const timer = timers.get(kind);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(kind);
  }
  const patch = pending.get(kind);
  pending.delete(kind);
  if (!patch) return;
  try {
    const current = await loadReaderSettings(kind);
    await AsyncStorage.setItem(keyFor(kind), JSON.stringify(sanitize({ ...current, ...patch })));
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Merge a partial settings patch into the kind's bundle. Fire-and-forget: the
 * write is debounced ~500ms so per-frame slider updates collapse into one.
 */
export function saveReaderSettings(kind: ReaderSettingsKind, partial: ReaderSettings): void {
  pending.set(kind, { ...pending.get(kind), ...partial });
  const existing = timers.get(kind);
  if (existing !== undefined) clearTimeout(existing);
  timers.set(
    kind,
    setTimeout(() => {
      void flush(kind);
    }, WRITE_DEBOUNCE_MS),
  );
}

/** Force all pending debounced writes to disk now (tests / teardown). */
export async function flushReaderSettings(): Promise<void> {
  const kinds = [...pending.keys()];
  await Promise.all(kinds.map((k) => flush(k)));
}
