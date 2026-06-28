import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import type { ContentType } from '@/api/schemas';

type PillKind = ContentType | 'primary' | 'neutral';
type PillSize = 'xs' | 'sm' | 'md';

const SIZES: Record<PillSize, { height: number; padX: number; font: number }> = {
  xs: { height: 16, padX: 6, font: 8.5 },
  sm: { height: 19, padX: 7, font: 9.5 },
  md: { height: 22, padX: 9, font: 10.5 },
};

// Solid pill-shaped chip (mono, uppercase). Mirrors the web ContentTypePill:
// solid card/surface background, content-type-colored text and border (at 0.5
// opacity). The design system requires SOLID badge backgrounds so pills remain
// legible over both dark covers and light page backgrounds.
export function Pill({
  kind = 'neutral',
  size = 'sm',
  children,
}: {
  kind?: PillKind;
  size?: PillSize;
  children: ReactNode;
}) {
  const t = useTokens();
  const s = SIZES[size];

  let bg: string;
  let fg: string;
  let line: string;
  if (kind === 'primary') {
    // Solid surface background; primary-colored text + border — no alpha bg.
    bg = t.surface;
    fg = t.primary;
    line = withAlpha(t.primary, 0.5);
  } else if (kind === 'neutral') {
    bg = t.surfaceMuted;
    fg = t.textMuted;
    line = t.border;
  } else {
    const color = { manga: t.manga, comic: t.comic, novel: t.novel, ebook: t.ebook, audio: t.audio }[
      kind
    ];
    // Solid card/surface background; type-colored text and border at 0.5 opacity.
    // Matches web ContentTypePill: bg=card, color=type-var, border-color=type-var/0.5.
    bg = t.surface;
    fg = color;
    line = withAlpha(color, 0.5);
  }

  return (
    <View
      style={{
        height: s.height,
        paddingHorizontal: s.padX,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: fonts.mono.medium,
          fontSize: s.font,
          letterSpacing: 0.9,
          color: fg,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Text>
    </View>
  );
}

// Back-compat wrapper used across the library lists.
export function ContentTypePill({ type, size = 'sm' }: { type: ContentType; size?: PillSize }) {
  return (
    <Pill kind={type} size={size}>
      {type}
    </Pill>
  );
}
