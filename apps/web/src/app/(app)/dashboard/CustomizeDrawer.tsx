'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown, Sliders } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  WIDGET_META,
  WIDGET_ICON,
  WIDGET_IDS,
  DEFAULT_ORDER,
  SOCIAL_ORDER,
  defaultPrefs,
  type DashboardPrefs,
  type WidgetId,
} from '@/components/dashboard/widget-registry';

/** Reorder one widget within the order by `dir` (-1 up, +1 down). */
function moveInOrder(order: WidgetId[], id: WidgetId, dir: -1 | 1): WidgetId[] {
  const next = order.slice();
  const i = next.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Build the {order, enabled} for a preset: that order, every widget enabled. */
function presetPrefs(order: WidgetId[]): DashboardPrefs {
  return {
    order: [...order],
    enabled: Object.fromEntries(WIDGET_IDS.map((id) => [id, true])) as Record<WidgetId, boolean>,
  };
}

function CustomizeRow({
  id,
  on,
  first,
  last,
  onToggle,
  onMove,
}: {
  id: WidgetId;
  on: boolean;
  first: boolean;
  last: boolean;
  onToggle: (id: WidgetId) => void;
  onMove: (id: WidgetId, dir: -1 | 1) => void;
}): React.JSX.Element {
  const meta = WIDGET_META[id];
  const Icon = WIDGET_ICON[id];
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border p-3 transition-opacity"
      style={{
        background: on ? 'var(--color-card)' : 'transparent',
        opacity: on ? 1 : 0.55,
      }}
    >
      <div className="flex flex-col gap-px">
        <button
          type="button"
          onClick={() => onMove(id, -1)}
          disabled={first}
          aria-label={`Move ${meta.label} up`}
          className="grid h-4 w-[22px] place-items-center rounded text-muted-foreground transition-opacity hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          <ChevronUp className="size-[13px]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onMove(id, 1)}
          disabled={last}
          aria-label={`Move ${meta.label} down`}
          className="grid h-4 w-[22px] place-items-center rounded text-muted-foreground transition-opacity hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          <ChevronDown className="size-[13px]" aria-hidden />
        </button>
      </div>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg border"
        style={{
          background: on ? 'color-mix(in srgb, var(--color-primary) 14%, transparent)' : 'var(--color-elevated)',
          borderColor: on ? 'color-mix(in srgb, var(--color-primary) 35%, transparent)' : 'var(--color-border)',
          color: on ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
        }}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-foreground">{meta.label}</div>
        <div className="mt-px text-[11.5px] text-muted-foreground">{meta.desc}</div>
      </div>
      <Switch
        checked={on}
        onCheckedChange={() => onToggle(id)}
        aria-label={`Toggle ${meta.label}`}
      />
    </div>
  );
}

export type CustomizeDrawerHandle = { open: () => void };

/**
 * The Customize dashboard drawer — a right-side Sheet listing every widget with
 * reorder arrows + an enable Switch. Header presets apply Balanced/Social-forward;
 * the footer shows the shown/total count, a reset, and a Done button. Changes are
 * persisted to `/api/dashboard/prefs` (debounced) and the dashboard is refreshed
 * via `router.refresh()` so the new layout renders server-side.
 *
 * The trigger is exposed via an imperative handle so the page's "Customize"
 * button and the all-off empty-state CTA can both open it.
 */
export const CustomizeDrawer = React.forwardRef<
  CustomizeDrawerHandle,
  { initial: DashboardPrefs }
>(function CustomizeDrawer({ initial }, ref): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [prefs, setPrefs] = React.useState<DashboardPrefs>(initial);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

  const persist = React.useCallback(
    (next: DashboardPrefs) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void fetch('/api/dashboard/prefs', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        })
          .then(() => router.refresh())
          .catch(() => {
            /* best-effort; the drawer keeps the optimistic state */
          });
      }, 400);
    },
    [router],
  );

  const update = React.useCallback(
    (next: DashboardPrefs) => {
      setPrefs(next);
      persist(next);
    },
    [persist],
  );

  const onToggle = (id: WidgetId): void => {
    update({ ...prefs, enabled: { ...prefs.enabled, [id]: !prefs.enabled[id] } });
  };
  const onMove = (id: WidgetId, dir: -1 | 1): void => {
    update({ ...prefs, order: moveInOrder(prefs.order, id, dir) });
  };
  const onPreset = (order: WidgetId[]): void => {
    update(presetPrefs(order));
  };
  const onReset = (): void => {
    update(defaultPrefs());
  };

  // Flush any pending save when the drawer closes.
  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next && saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void fetch('/api/dashboard/prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(prefs),
      })
        .then(() => router.refresh())
        .catch(() => {});
    }
  };

  React.useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const shown = prefs.order.filter((id) => prefs.enabled[id]).length;
  const total = prefs.order.length;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[408px] max-w-[92vw] flex-col gap-0 border-l border-border bg-background p-0 sm:max-w-[408px]"
      >
        <SheetHeader className="space-y-0 border-b border-border px-[22px] pb-4 pt-5 text-left">
          <div className="flex items-center gap-2.5">
            <Sliders className="size-[18px] text-primary" aria-hidden />
            <SheetTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
              Customize dashboard
            </SheetTitle>
          </div>
          <SheetDescription className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            Choose which widgets appear and reorder them. Saved to your profile.
          </SheetDescription>
          <div className="mt-3.5 flex items-center gap-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
              Presets
            </span>
            <button
              type="button"
              onClick={() => onPreset(DEFAULT_ORDER)}
              className="h-[26px] rounded-full border border-border bg-elevated px-[11px] text-[11.5px] font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              Balanced
            </button>
            <button
              type="button"
              onClick={() => onPreset(SOCIAL_ORDER)}
              className="h-[26px] rounded-full border border-border bg-elevated px-[11px] text-[11.5px] font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              Social-forward
            </button>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-[18px] py-3.5">
          {prefs.order.map((id, i) => (
            <CustomizeRow
              key={id}
              id={id}
              on={prefs.enabled[id]}
              first={i === 0}
              last={i === prefs.order.length - 1}
              onToggle={onToggle}
              onMove={onMove}
            />
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-[22px] py-3.5">
          <span className="font-mono text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{shown}</span> of {total} shown
          </span>
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="h-9 rounded-lg bg-primary px-[18px] text-[13px] font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
});
