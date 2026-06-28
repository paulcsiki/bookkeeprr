/**
 * Canonical dashboard widget registry — the single source of truth for the
 * widget set, the default/preset orders, per-widget UI meta (label, description,
 * icon), and the pure merge/validate helpers used by both the customize drawer
 * and the server-side prefs DAL.
 *
 * Layout primitives (`packRows`, `rowColumns`, span meta) live in
 * `page-layout.ts`; this module re-exports the widget id + default order from
 * there so there is exactly one definition of each.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpen,
  CalendarDays,
  Globe,
  Grid3x3,
  Plus,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import {
  WIDGET_META,
  DEFAULT_ORDER,
  type WidgetId,
} from './page-layout';

export { WIDGET_META, DEFAULT_ORDER };
export type { WidgetId };

/** Every known widget id (order-independent). Derived from the layout meta. */
export const WIDGET_IDS: readonly WidgetId[] = Object.keys(WIDGET_META) as WidgetId[];

/** Quick membership test against the known widget set. */
export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && value in WIDGET_META;
}

/**
 * The "Social-forward" preset: leads with the household-social widgets
 * (leaderboard, activity feed, releases) before the personal stats. Mirrors the
 * prototype's `SOCIAL_ORDER`.
 */
export const SOCIAL_ORDER: WidgetId[] = [
  'continue',
  'leaderboard',
  'feed',
  'releases',
  'personal',
  'goals',
  'format',
  'server',
  'recent',
];

/** Per-widget icon for the customize drawer rows + empty-state heading. */
export const WIDGET_ICON: Record<WidgetId, LucideIcon> = {
  continue: BookOpen,
  personal: Activity,
  goals: Target,
  leaderboard: Trophy,
  format: Grid3x3,
  feed: Users,
  releases: CalendarDays,
  server: Globe,
  recent: Plus,
};

/** A user's dashboard layout: the widget order + which widgets are enabled. */
export type DashboardPrefs = {
  order: WidgetId[];
  enabled: Record<WidgetId, boolean>;
};

/** The factory default: the canonical order with every widget enabled. */
export function defaultPrefs(): DashboardPrefs {
  return {
    order: [...DEFAULT_ORDER],
    enabled: Object.fromEntries(WIDGET_IDS.map((id) => [id, true])) as Record<WidgetId, boolean>,
  };
}

/**
 * Merge a (possibly stale or partial) stored prefs blob over the factory
 * default so the result is always complete and valid:
 *
 *  - the order keeps stored ids that are still known, in their stored position,
 *    drops unknown ids, then appends any known id missing from the stored order
 *    (in DEFAULT_ORDER position) — so a newly-added widget appears at the end;
 *  - enabled defaults every known id to `true`, then applies stored booleans for
 *    known ids only (unknown keys ignored) — a new widget defaults to on.
 *
 * Robust to the widget set changing in either direction.
 */
export function mergePrefs(stored: {
  order?: unknown;
  enabled?: unknown;
} | null | undefined): DashboardPrefs {
  const base = defaultPrefs();
  if (!stored || typeof stored !== 'object') return base;

  // ── order ──────────────────────────────────────────────────
  const rawOrder = Array.isArray(stored.order) ? stored.order : [];
  const seen = new Set<WidgetId>();
  const order: WidgetId[] = [];
  for (const id of rawOrder) {
    if (isWidgetId(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  // Append any known widget the stored order didn't mention, in default order.
  for (const id of DEFAULT_ORDER) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }

  // ── enabled ────────────────────────────────────────────────
  const enabled = { ...base.enabled };
  const rawEnabled =
    stored.enabled && typeof stored.enabled === 'object'
      ? (stored.enabled as Record<string, unknown>)
      : {};
  for (const id of WIDGET_IDS) {
    if (typeof rawEnabled[id] === 'boolean') {
      enabled[id] = rawEnabled[id] as boolean;
    }
  }

  return { order, enabled };
}

/** Result of validating an incoming prefs payload. */
export type ValidateResult =
  | { ok: true; value: DashboardPrefs }
  | { ok: false; error: string };

/**
 * Validate an untrusted prefs payload (from the PUT body). The order must be a
 * permutation of the known widget ids — every known id present exactly once and
 * no unknown ids; the enabled map must cover every known id with booleans (and
 * no unknown keys). Returns a normalized {order, enabled} on success.
 */
export function validatePrefs(input: unknown): ValidateResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'not an object' };
  const { order, enabled } = input as { order?: unknown; enabled?: unknown };

  if (!Array.isArray(order)) return { ok: false, error: 'order must be an array' };
  if (order.length !== WIDGET_IDS.length) {
    return { ok: false, error: 'order must list every widget exactly once' };
  }
  const seen = new Set<string>();
  for (const id of order) {
    if (!isWidgetId(id)) return { ok: false, error: `unknown widget id: ${String(id)}` };
    if (seen.has(id)) return { ok: false, error: `duplicate widget id: ${id}` };
    seen.add(id);
  }

  if (!enabled || typeof enabled !== 'object') {
    return { ok: false, error: 'enabled must be an object' };
  }
  const keys = Object.keys(enabled as Record<string, unknown>);
  if (keys.length !== WIDGET_IDS.length) {
    return { ok: false, error: 'enabled must cover every widget' };
  }
  const normalizedEnabled = {} as Record<WidgetId, boolean>;
  for (const key of keys) {
    if (!isWidgetId(key)) return { ok: false, error: `unknown enabled key: ${key}` };
    const v = (enabled as Record<string, unknown>)[key];
    if (typeof v !== 'boolean') return { ok: false, error: `enabled.${key} must be a boolean` };
    normalizedEnabled[key] = v;
  }

  return {
    ok: true,
    value: { order: order as WidgetId[], enabled: normalizedEnabled },
  };
}
