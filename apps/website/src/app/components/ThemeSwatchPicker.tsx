'use client';

import { useEffect, useState } from 'react';

/**
 * Live theme swatch picker for the FeatureGrid "theming" feature card.
 *
 * Clicking a swatch swaps the document body's `theme-*` class so the entire
 * page retints from `--color-primary` (the marketing site is dark-only; the
 * white swatch flips to black on a light-OS preference via themes.css).
 */
type SwatchKey = 'violet' | 'amber' | 'rose' | 'teal' | 'sky' | 'lime' | 'mono';

const SWATCHES: ReadonlyArray<{ key: SwatchKey; label: string; color: string }> = [
  { key: 'violet', label: 'Tsundoku', color: 'hsl(263 70% 60%)' },
  { key: 'amber', label: 'Kohaku', color: 'hsl(38 82% 58%)' },
  { key: 'rose', label: 'Sakura', color: 'hsl(348 80% 62%)' },
  { key: 'teal', label: 'Asagi', color: 'hsl(174 70% 50%)' },
  { key: 'sky', label: 'Sora', color: 'hsl(208 90% 62%)' },
  { key: 'lime', label: 'Moegi', color: 'hsl(96 62% 56%)' },
  { key: 'mono', label: 'Shiro', color: 'hsl(0 0% 90%)' },
];

const ALL_THEME_CLASSES = SWATCHES.map((s) => `theme-${s.key}`);

function readActiveTheme(): SwatchKey {
  if (typeof document === 'undefined') return 'violet';
  for (const s of SWATCHES) {
    if (document.body.classList.contains(`theme-${s.key}`)) return s.key;
  }
  return 'violet';
}

export function ThemeSwatchPicker(): React.JSX.Element {
  const [active, setActive] = useState<SwatchKey>('violet');

  useEffect(() => {
    setActive(readActiveTheme());
  }, []);

  function pick(key: SwatchKey): void {
    if (typeof document === 'undefined') return;
    document.body.classList.remove(...ALL_THEME_CLASSES);
    document.body.classList.add(`theme-${key}`);
    setActive(key);
  }

  return (
    <div className="themes-row" id="themeSwatches">
      {SWATCHES.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-label={`Pick ${s.label} accent`}
          title={s.label}
          onClick={() => pick(s.key)}
          className={`theme-swatch${active === s.key ? ' active' : ''}`}
          style={{ background: s.color, color: s.color }}
          data-key={s.key}
        />
      ))}
    </div>
  );
}
