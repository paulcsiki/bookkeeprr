# @bookkeeprr/ui

Shared React component library for the bookkeeprr web app. Web-only (uses React JSX, next-themes, and CSS custom properties from `@bookkeeprr/tokens`).

## Exports

| Export            | Description                                    |
| ----------------- | ---------------------------------------------- |
| `Logo`            | Full logo lockup (mark + wordmark)             |
| `LogoMark`        | Mark only (the disc icon)                      |
| `ContentTypePill` | Chip showing content type (manga, comic, etc.) |
| `ThemeProvider`   | next-themes wrapper for the 7 accent themes    |
| `ACCENT_THEMES`   | Tuple of valid theme keys                      |
| `THEME_LABELS`    | Display names for each theme                   |
| `THEME_HUES`      | HSL color values for each theme swatch         |
| `AccentTheme`     | TypeScript type for theme keys                 |
| `ThemePicker`     | Top-bar swatch picker component                |
| `cn`              | clsx + tailwind-merge helper                   |

## Usage

```tsx
import { Logo, ThemeProvider, ContentTypePill } from '@bookkeeprr/ui';
import '@bookkeeprr/tokens/web.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <header>
        <Logo size={28} />
      </header>
      <main>
        <ContentTypePill type="manga" />
        {children}
      </main>
    </ThemeProvider>
  );
}
```
