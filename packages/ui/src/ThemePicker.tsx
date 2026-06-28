'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from './utils';
import { ACCENT_THEMES, THEME_HUES, THEME_LABELS, type AccentTheme } from './ThemeProvider';
import { useMode } from './mode';

/**
 * Top-bar theme picker. At rest it's a single circle in the current accent
 * colour (like the marketing-site swatch). On hover (or keyboard focus) it
 * expands leftward to reveal the other accents as circles; hovering a circle
 * shows its theme name, and clicking one retints the app via `--color-primary`.
 *
 * The row is right-anchored and absolutely positioned inside a one-circle
 * footprint so the resting circle stays put and the expansion overlays empty
 * space rather than pushing the neighbouring top-bar actions. Per-item margin
 * (not gap) keeps the collapsed footprint exactly one circle wide.
 */
export function ThemePicker(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const { effectiveMode } = useMode();
  const [mounted, setMounted] = useState(false);

  // next-themes returns undefined on first render to avoid hydration mismatch.
  useEffect(() => setMounted(true), []);

  const active = (mounted ? (theme as AccentTheme) : 'violet') ?? 'violet';
  // Other accents first, active last, so the active swatch is the right-most
  // (resting) circle and the rest fan out to its left.
  const ordered: AccentTheme[] = [...ACCENT_THEMES.filter((t) => t !== active), active];

  return (
    <div
      role="radiogroup"
      aria-label="Accent theme"
      className="group relative inline-flex h-[22px] w-[22px] items-center justify-end"
    >
      <div className="absolute right-0 flex items-center">
        {ordered.map((t) => {
          const isActive = active === t;
          // Shiro (mono) is a near-white swatch — unusable in light mode.
          // Sumi (ink) is a near-black swatch — unusable in dark mode.
          const isGuarded =
            (t === 'mono' && effectiveMode === 'light') ||
            (t === 'ink' && effectiveMode === 'dark');
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={
                isGuarded
                  ? `Theme: ${THEME_LABELS[t]} (unavailable in current mode)`
                  : `Theme: ${THEME_LABELS[t]}`
              }
              disabled={isGuarded}
              aria-disabled={isGuarded}
              onClick={() => {
                if (!isGuarded) setTheme(t);
              }}
              className={cn(
                'group/sw relative h-[22px] shrink-0 rounded-full border border-[hsl(0_0%_100%/0.18)] transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isGuarded && 'cursor-not-allowed opacity-40',
                isActive
                  ? 'w-[22px] ring-2 ring-foreground/70 ring-offset-2 ring-offset-background'
                  : 'ml-0 w-0 scale-0 opacity-0 group-hover:ml-1.5 group-hover:w-[22px] group-hover:scale-100 group-hover:opacity-100 group-focus-within:ml-1.5 group-focus-within:w-[22px] group-focus-within:scale-100 group-focus-within:opacity-100',
              )}
              style={{ backgroundColor: THEME_HUES[t] }}
            >
              <span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/sw:opacity-100">
                {THEME_LABELS[t]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
