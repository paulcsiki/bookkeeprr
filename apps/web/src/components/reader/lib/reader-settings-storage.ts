/**
 * Per-browser persistence for the reader's durable display settings, keyed by
 * reader kind (`comics` / `text` / `audio`) so each player remembers its own
 * preferences. localStorage-backed under `bookkeeprr-reader-settings:<kind>`
 * (the repo's `bookkeeprr-*` storage convention — see `packages/ui/src/mode.tsx`).
 *
 * Only durable, user-chosen settings live here (theme, brightness, fonts,
 * spread, playback rate, …) — transient state (current page, zoom, sleep
 * timers, bookmarks) is deliberately NOT persisted. All access is SSR-safe
 * (`typeof window` guards) and wrapped in try/catch so Safari private mode /
 * quota errors degrade to in-memory defaults. Loads are validated + clamped so
 * a corrupt or hand-edited payload can never break the reader.
 */

import { READER_THEME_KEYS, type ReaderThemeKey } from './reader-theme';
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_H_MAX,
  LINE_H_MIN,
} from './text-settings';
import type {
  ReaderDir,
  ReaderFontKey,
  ReaderPageMode,
  ReaderSpread,
} from '../SettingsSheet';

export type ReaderSettingsKind = 'comics' | 'text' | 'audio';

/**
 * The persisted shape. Every field is optional — absence means "the user never
 * chose", letting per-content-type seeds (e.g. comics→OLED, text→paper) keep
 * working until an explicit pick.
 */
export interface PersistedReaderSettings {
  /** Page theme — persisted only on an explicit user pick. */
  themeKey?: ReaderThemeKey;
  /** Whether the theme follows the OS color scheme. */
  auto?: boolean;
  /** Dimmer level, 0..1 (1 = no dimming). */
  brightness?: number;
  /** Warm-tint level, 0..1 (0 = off). */
  warmth?: number;
  /** Text reader: font size in pt, clamped to [13, 28]. */
  fontSize?: number;
  /** Text reader: line height, clamped to [1.3, 2.2]. */
  lineH?: number;
  /** Text reader: font family choice. */
  font?: ReaderFontKey;
  /** Text reader: paged vs scroll layout. */
  pageMode?: ReaderPageMode;
  /** Comics reader: single / double / webtoon spread. */
  spread?: ReaderSpread;
  /** Comics reader: page-turn direction (rtl / ltr). */
  dir?: ReaderDir;
  /** Audio reader: playback rate, clamped to [0.5, 3]. */
  rate?: number;
  /** Audio reader: auto-scroll the chapter list while playing. */
  autoscroll?: boolean;
}

const STORAGE_PREFIX = 'bookkeeprr-reader-settings:';

/** Debounce window for slider-driven saves (brightness / warmth). */
export const SAVE_DEBOUNCE_MS = 500;

export const RATE_MIN = 0.5;
export const RATE_MAX = 3;

const FONT_KEYS: readonly string[] = ['serif', 'sans', 'mono', 'dys'];
const PAGE_MODES: readonly string[] = ['paged', 'scroll'];
const SPREADS: readonly string[] = ['single', 'double', 'webtoon'];
const DIRS: readonly string[] = ['rtl', 'ltr'];

function storageKey(kind: ReaderSettingsKind): string {
  return `${STORAGE_PREFIX}${kind}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Validate an unknown payload into a safe {@link PersistedReaderSettings}:
 * unknown fields are dropped, enums must match exactly, numbers are clamped to
 * their legal ranges. Never throws.
 */
export function sanitizeReaderSettings(raw: unknown): PersistedReaderSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: PersistedReaderSettings = {};

  if (
    typeof r.themeKey === 'string' &&
    (READER_THEME_KEYS as readonly string[]).includes(r.themeKey)
  ) {
    out.themeKey = r.themeKey as ReaderThemeKey;
  }
  if (typeof r.auto === 'boolean') out.auto = r.auto;

  const brightness = finite(r.brightness);
  if (brightness !== undefined) out.brightness = clamp(brightness, 0, 1);
  const warmth = finite(r.warmth);
  if (warmth !== undefined) out.warmth = clamp(warmth, 0, 1);

  const fontSize = finite(r.fontSize);
  if (fontSize !== undefined) out.fontSize = clamp(fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX);
  const lineH = finite(r.lineH);
  if (lineH !== undefined) out.lineH = clamp(lineH, LINE_H_MIN, LINE_H_MAX);
  if (typeof r.font === 'string' && FONT_KEYS.includes(r.font)) {
    out.font = r.font as ReaderFontKey;
  }
  if (typeof r.pageMode === 'string' && PAGE_MODES.includes(r.pageMode)) {
    out.pageMode = r.pageMode as ReaderPageMode;
  }

  if (typeof r.spread === 'string' && SPREADS.includes(r.spread)) {
    out.spread = r.spread as ReaderSpread;
  }
  if (typeof r.dir === 'string' && DIRS.includes(r.dir)) {
    out.dir = r.dir as ReaderDir;
  }

  const rate = finite(r.rate);
  if (rate !== undefined) out.rate = clamp(rate, RATE_MIN, RATE_MAX);
  if (typeof r.autoscroll === 'boolean') out.autoscroll = r.autoscroll;

  return out;
}

/**
 * Load the persisted settings for a reader kind. Returns `{}` when there's no
 * window (SSR), no entry, corrupt JSON, or a blocked storage (private mode).
 */
export function loadReaderSettings(kind: ReaderSettingsKind): PersistedReaderSettings {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (raw === null) return {};
    return sanitizeReaderSettings(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** Merge a patch over what's stored and write it back. Best-effort. */
function writeMerged(kind: ReaderSettingsKind, patch: PersistedReaderSettings): void {
  if (typeof window === 'undefined') return;
  try {
    const merged = sanitizeReaderSettings({ ...loadReaderSettings(kind), ...patch });
    window.localStorage.setItem(storageKey(kind), JSON.stringify(merged));
  } catch {
    /* private mode / quota — best-effort persistence */
  }
}

// One pending debounced patch per kind; an immediate save folds it in so a
// later discrete change can never be overwritten by an older slider value.
const pending = new Map<
  ReaderSettingsKind,
  { timer: ReturnType<typeof setTimeout>; patch: PersistedReaderSettings }
>();

/** Persist a patch immediately (discrete picks: theme, font, spread, rate…). */
export function saveReaderSettings(
  kind: ReaderSettingsKind,
  patch: PersistedReaderSettings,
): void {
  const p = pending.get(kind);
  if (p) {
    clearTimeout(p.timer);
    pending.delete(kind);
    writeMerged(kind, { ...p.patch, ...patch });
  } else {
    writeMerged(kind, patch);
  }
}

/**
 * Persist a patch after a ~500ms quiet period — for slider-driven values
 * (brightness / warmth) that fire continuously during a drag. Patches for the
 * same kind coalesce; a subsequent immediate save flushes them.
 */
export function saveReaderSettingsDebounced(
  kind: ReaderSettingsKind,
  patch: PersistedReaderSettings,
): void {
  const prev = pending.get(kind);
  const merged = prev ? { ...prev.patch, ...patch } : { ...patch };
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pending.delete(kind);
    writeMerged(kind, merged);
  }, SAVE_DEBOUNCE_MS);
  pending.set(kind, { timer, patch: merged });
}
