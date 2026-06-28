# @bookkeeprr/tokens

Design tokens for bookkeeprr — colors, theme variants, radius, font-family hooks.

## Web (Next.js, Vite, anything CSS-aware)

```ts
// In your global stylesheet entry
import '@bookkeeprr/tokens/tokens.css';
import '@bookkeeprr/tokens/themes.css';
```

Reference values as CSS custom properties: `var(--color-primary)`, `var(--color-manga)`, etc. Tailwind v4 picks them up via the embedded `@theme` block.

## React Native

```ts
import { colors, themes, type ThemeName } from '@bookkeeprr/tokens';

const styles = StyleSheet.create({
  pill: { backgroundColor: colors.primary },
});
```

The JS mirror is hand-maintained in lockstep with the CSS. See `src/tokens.ts`.

## Conventions

- **Content-type accents** (`--color-manga` … `--color-audio`) are FIXED across themes.
- **Primary/ring** change per theme variant (`.theme-violet` … `.theme-mono`).
- **Light-accent themes** (amber, lime, mono) flip `--color-primary-foreground` to dark ink.
