'use client';

import { useTheme } from 'next-themes';
import { useMode } from './mode';
import { ACCENT_THEMES, THEME_HUES, THEME_LABELS, type AccentTheme } from './ThemeProvider';
import { cn } from './utils';

export type AppearanceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Render as flat in-page content (no card chrome, no dialog role, no header)
   *  for embedding in a settings section. Defaults to the modal presentation. */
  inline?: boolean;
};

const MODE_LABELS = { light: 'Light', dark: 'Dark', system: 'System' } as const;

/**
 * In-app Appearance picker — see §08 Forms & dialogs (`appx-*` family) in
 * `docs/design/bookkeeprr-design-system.html`. Mode picker on top
 * (Light / Dark / System), accent picker below (8 swatches with
 * mode-aware guards). As a modal it closes via Esc or click-outside via the
 * wrapping Dialog primitive. Pass `inline` to embed it as plain content
 * inside a settings section (the section supplies the heading).
 */
export function AppearanceDialog({ open, onOpenChange, inline = false }: AppearanceDialogProps): React.JSX.Element | null {
  const { theme, setTheme } = useTheme();
  const { mode, effectiveMode, setMode } = useMode();
  if (!open) return null;

  const isGuarded = (t: AccentTheme): boolean => {
    if (t === 'mono' && effectiveMode === 'light') return true;
    if (t === 'ink' && effectiveMode === 'dark') return true;
    return false;
  };

  const body = (
    <>
      <div className="mb-5">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Mode
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(['light', 'dark', 'system'] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-foreground hover:bg-muted',
                )}
              >
                {MODE_LABELS[m]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Accent
        </div>
        <div className="flex flex-wrap gap-3">
          {ACCENT_THEMES.map((t) => {
            const active = theme === t;
            const guarded = isGuarded(t);
            return (
              <button
                key={t}
                type="button"
                aria-label={THEME_LABELS[t]}
                title={guarded ? `${THEME_LABELS[t]} — unavailable in ${effectiveMode} mode` : THEME_LABELS[t]}
                disabled={guarded}
                onClick={() => setTheme(t)}
                style={{ background: THEME_HUES[t] }}
                className={cn(
                  'relative h-7 w-7 rounded-full border border-[hsl(0_0%_100%/0.18)] transition-transform',
                  active && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                  guarded && 'opacity-30 cursor-not-allowed',
                  !guarded && 'hover:scale-110',
                )}
              />
            );
          })}
        </div>
      </div>
    </>
  );

  // Inline (settings-section) presentation: no card chrome, no dialog role, no header.
  if (inline) return <div>{body}</div>;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Appearance"
      className="rounded-lg border border-border bg-card p-5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onOpenChange(false);
      }}
    >
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how bookkeeprr looks. Mode flips neutrals; accent retints the brand color.
        </p>
      </div>
      {body}
    </div>
  );
}
