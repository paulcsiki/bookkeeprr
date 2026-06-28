import { describe, expect, it } from 'vitest';
import {
  WIDGET_IDS,
  DEFAULT_ORDER,
  SOCIAL_ORDER,
  isWidgetId,
  defaultPrefs,
  mergePrefs,
  validatePrefs,
  type DashboardPrefs,
} from '@/components/dashboard/widget-registry';
import { packRows } from '@/components/dashboard/page-layout';

describe('widget registry constants', () => {
  it('DEFAULT_ORDER and SOCIAL_ORDER are both permutations of the widget set', () => {
    expect([...DEFAULT_ORDER].sort()).toEqual([...WIDGET_IDS].sort());
    expect([...SOCIAL_ORDER].sort()).toEqual([...WIDGET_IDS].sort());
  });

  it('isWidgetId recognizes known ids and rejects others', () => {
    expect(isWidgetId('continue')).toBe(true);
    expect(isWidgetId('bogus')).toBe(false);
    expect(isWidgetId(42)).toBe(false);
    expect(isWidgetId(null)).toBe(false);
  });
});

describe('defaultPrefs', () => {
  it('is the default order with every widget enabled', () => {
    const d = defaultPrefs();
    expect(d.order).toEqual(DEFAULT_ORDER);
    expect(Object.values(d.enabled).every((v) => v === true)).toBe(true);
    expect(Object.keys(d.enabled).sort()).toEqual([...WIDGET_IDS].sort());
  });
});

describe('mergePrefs', () => {
  it('returns the default when nothing is stored', () => {
    expect(mergePrefs(null)).toEqual(defaultPrefs());
    expect(mergePrefs(undefined)).toEqual(defaultPrefs());
    expect(mergePrefs({})).toEqual(defaultPrefs());
  });

  it('preserves a valid stored order + enabled map', () => {
    const enabled = Object.fromEntries(WIDGET_IDS.map((id) => [id, true]));
    enabled.feed = false;
    const merged = mergePrefs({ order: SOCIAL_ORDER, enabled });
    expect(merged.order).toEqual(SOCIAL_ORDER);
    expect(merged.enabled.feed).toBe(false);
    expect(merged.enabled.continue).toBe(true);
  });

  it('drops unknown stored ids and appends missing known ids in default order', () => {
    // stored order omits everything except a couple known ids + a bogus one
    const merged = mergePrefs({
      order: ['recent', 'ghost', 'continue'],
      enabled: {},
    });
    // kept stored ids first, in stored order, then the rest in DEFAULT_ORDER order
    expect(merged.order.slice(0, 2)).toEqual(['recent', 'continue']);
    expect(merged.order).not.toContain('ghost');
    expect([...merged.order].sort()).toEqual([...WIDGET_IDS].sort());
    // a known id absent from stored enabled defaults to on
    expect(merged.enabled.personal).toBe(true);
  });

  it('defaults a newly-added widget id to enabled (unknown enabled keys ignored)', () => {
    // simulate a stale blob that predates some widgets: only enables `continue`
    const merged = mergePrefs({
      order: ['continue'],
      enabled: { continue: false, deadWidget: true },
    });
    expect(merged.enabled.continue).toBe(false);
    // every other (newer) widget defaults on
    for (const id of WIDGET_IDS) {
      if (id !== 'continue') expect(merged.enabled[id]).toBe(true);
    }
    // unknown enabled key is not carried through
    expect('deadWidget' in merged.enabled).toBe(false);
  });

  it('de-duplicates repeated stored ids', () => {
    const merged = mergePrefs({ order: ['continue', 'continue', 'recent'], enabled: {} });
    expect(merged.order.filter((id) => id === 'continue')).toHaveLength(1);
    expect([...merged.order].sort()).toEqual([...WIDGET_IDS].sort());
  });
});

describe('validatePrefs', () => {
  function fullEnabled(overrides: Record<string, boolean> = {}): Record<string, boolean> {
    return { ...Object.fromEntries(WIDGET_IDS.map((id) => [id, true])), ...overrides };
  }

  it('accepts a valid permutation + complete enabled map', () => {
    const result = validatePrefs({ order: SOCIAL_ORDER, enabled: fullEnabled({ feed: false }) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.order).toEqual(SOCIAL_ORDER);
      expect(result.value.enabled.feed).toBe(false);
    }
  });

  it('rejects a non-object', () => {
    expect(validatePrefs(null).ok).toBe(false);
    expect(validatePrefs('x').ok).toBe(false);
  });

  it('rejects an order with a bogus id', () => {
    const order = [...DEFAULT_ORDER.slice(0, -1), 'bogus'];
    expect(validatePrefs({ order, enabled: fullEnabled() }).ok).toBe(false);
  });

  it('rejects an order that is missing an id (wrong length)', () => {
    expect(validatePrefs({ order: DEFAULT_ORDER.slice(1), enabled: fullEnabled() }).ok).toBe(false);
  });

  it('rejects an order with a duplicate id', () => {
    const order = [...DEFAULT_ORDER];
    order[1] = order[0]!;
    expect(validatePrefs({ order, enabled: fullEnabled() }).ok).toBe(false);
  });

  it('rejects an enabled map with an unknown key', () => {
    const enabled = fullEnabled();
    enabled.bogus = true;
    expect(validatePrefs({ order: DEFAULT_ORDER, enabled }).ok).toBe(false);
  });

  it('rejects an enabled map missing a key', () => {
    const enabled = fullEnabled();
    delete enabled.feed;
    expect(validatePrefs({ order: DEFAULT_ORDER, enabled }).ok).toBe(false);
  });

  it('rejects a non-boolean enabled value', () => {
    const enabled = fullEnabled() as Record<string, unknown>;
    enabled.feed = 'yes';
    expect(validatePrefs({ order: DEFAULT_ORDER, enabled }).ok).toBe(false);
  });
});

// Mirrors how the page selects + packs visible widgets from prefs.
function visibleRows(prefs: DashboardPrefs) {
  const visible = prefs.order.filter((id) => prefs.enabled[id]);
  return packRows(visible);
}

describe('page widget selection from prefs', () => {
  it('renders only enabled widgets in the stored order', () => {
    const prefs: DashboardPrefs = {
      // custom order: recent first, then a wide+rail pair, others disabled
      order: ['recent', 'leaderboard', 'format', 'continue', 'personal', 'goals', 'feed', 'releases', 'server'],
      enabled: {
        ...Object.fromEntries(WIDGET_IDS.map((id) => [id, false])),
        recent: true,
        leaderboard: true,
        format: true,
      } as Record<(typeof WIDGET_IDS)[number], boolean>,
    };
    expect(visibleRows(prefs)).toEqual([['recent'], ['leaderboard', 'format']]);
  });

  it('all widgets disabled → no rows (empty dashboard)', () => {
    const prefs: DashboardPrefs = {
      order: [...DEFAULT_ORDER],
      enabled: Object.fromEntries(WIDGET_IDS.map((id) => [id, false])) as Record<
        (typeof WIDGET_IDS)[number],
        boolean
      >,
    };
    expect(visibleRows(prefs)).toEqual([]);
  });
});
