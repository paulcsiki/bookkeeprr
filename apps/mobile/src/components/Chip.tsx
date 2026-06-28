import type { ReactNode } from 'react';
import { Pressable, Text, ScrollView } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import type { ContentType } from '@/api/schemas';

// Canonical filter chip per the 2026-05-30 design refresh:
//   inactive (any kind)  = neutral surface + muted text
//   active  + no kind    = primary tint (16% fill / 35% border)
//   active  + kind       = type-accent tint (16% fill / 40% border)
//   zero                 = dim, non-interactive
export function Chip({
  active,
  children,
  count,
  kind,
  onPress,
  testID,
  zero,
}: {
  active?: boolean;
  children: ReactNode;
  count?: number;
  kind?: ContentType;
  onPress?: () => void;
  testID?: string;
  zero?: boolean;
}) {
  const t = useTokens();
  const typeColor = kind
    ? { manga: t.manga, comic: t.comic, novel: t.novel, ebook: t.ebook, audio: t.audio }[kind]
    : undefined;

  let bg = t.surfaceMuted;
  let fg = t.textMuted;
  let line = t.border;

  if (active) {
    if (typeColor) {
      bg = withAlpha(typeColor, 0.16);
      line = withAlpha(typeColor, 0.4);
      fg = withAlpha(typeColor, 1);
    } else {
      bg = withAlpha(t.primary, 0.16);
      line = withAlpha(t.primary, 0.35);
      fg = t.primary;
    }
  }

  return (
    <Pressable
      onPress={zero ? undefined : onPress}
      testID={testID}
      disabled={zero}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: line,
        opacity: zero ? 0.45 : 1,
      }}
    >
      <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12.5, color: fg }}>{children}</Text>
      {count !== undefined ? (
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 10.5,
            letterSpacing: 0.4,
            color: fg,
            opacity: active ? 0.85 : 1,
          }}
        >
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14 }}
    >
      {children}
    </ScrollView>
  );
}
