import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { useLayout } from '@/responsive/useLayout';

interface Props {
  title: string;
  subtitle?: string; // mono caption under a large title
  leading?: ReactNode;
  trailing?: ReactNode;
  large?: boolean;
  transparent?: boolean;
  // `large` only: stack the trailing controls on their own row BELOW the
  // title + subtitle instead of beside them. Lets a long title (e.g. the Home
  // greeting "Good evening, <name>") use the full width instead of wrapping in
  // a narrow column next to the controls.
  trailingBelow?: boolean;
}

// Screen app bar. `large` renders a 30px display title with an optional mono
// subtitle (Library/Activity headers); otherwise a compact centered/leading
// title row. The top safe-area inset is owned by the surrounding
// `ScreenContainer` (a SafeAreaView) — the AppBar must NOT add it again, or
// AppBar screens (Library/Discover) get a double inset and sit noticeably
// lower than the non-AppBar screens (Settings/Activity).
export function AppBar({
  title,
  subtitle,
  leading,
  trailing,
  large,
  transparent,
  trailingBelow,
}: Props) {
  const t = useTokens();
  const layout = useLayout();
  // Tablet `large` headers scale per tablet-screens.jsx:150-179 (`fontSize: 32`,
  // `padding: '16px 28px 18px'`). Phone keeps the existing 30 / 18 / 14.
  const largeFontSize = layout.isTablet ? 32 : 30;
  const largePaddingH = layout.isTablet ? 28 : 18;
  const largePaddingB = layout.isTablet ? 18 : 14;
  return (
    <View
      style={{
        backgroundColor: transparent ? undefined : t.bg,
        borderBottomWidth: large || transparent ? 0 : 1,
        borderBottomColor: t.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: large ? 6 : 10,
          minHeight: 36,
        }}
      >
        {leading}
        {!large ? (
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: fonts.display.semibold,
              fontSize: 17,
              letterSpacing: -0.17,
              color: t.text,
              textAlign: leading ? 'center' : 'left',
              paddingRight: leading && !trailing ? 36 : 0,
            }}
          >
            {title}
          </Text>
        ) : null}
        {!large ? trailing : null}
      </View>

      {large
        ? (() => {
            const titleNode = (
              <Text
                style={{
                  fontFamily: fonts.display.semibold,
                  fontSize: largeFontSize,
                  // Design letter-spacing is -0.025em; convert to RN point value.
                  letterSpacing: -0.025 * largeFontSize,
                  color: t.text,
                  // Phone keeps the original 32px line-height (>= 30px font);
                  // tablet bumps to 34 to clear the 32px font with the same air.
                  lineHeight: largeFontSize === 32 ? 34 : 32,
                }}
              >
                {title}
              </Text>
            );
            const subtitleNode = subtitle ? (
              <Text style={[text.mono, { marginTop: 6, color: t.textMuted, letterSpacing: 0.5 }]}>
                {subtitle}
              </Text>
            ) : null;
            return (
              <View
                style={{
                  paddingHorizontal: largePaddingH,
                  paddingTop: 4,
                  paddingBottom: largePaddingB,
                }}
              >
                {trailingBelow ? (
                  // Full-width title with the controls stacked beneath, so a long
                  // greeting isn't squeezed into a narrow column.
                  <>
                    {titleNode}
                    {subtitleNode}
                    {trailing ? (
                      <View style={{ marginTop: 14, alignSelf: 'flex-start' }}>{trailing}</View>
                    ) : null}
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      {titleNode}
                      {subtitleNode}
                    </View>
                    {trailing}
                  </View>
                )}
              </View>
            );
          })()
        : null}
    </View>
  );
}
