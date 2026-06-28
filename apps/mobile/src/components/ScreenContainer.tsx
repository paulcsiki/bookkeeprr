import { View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTokens } from '@/theme/ThemeProvider';
import { useLayout } from '@/responsive/useLayout';

interface ScreenContainerProps extends ViewProps {
  /**
   * Safe-area edges to inset. Defaults to top/left/right on phones and all four
   * on tablets. The bottom is omitted on phones because those screens sit inside
   * the bottom tab navigator, whose tab bar already owns the bottom inset —
   * applying it again here left a black dead-gap between the scroll content and
   * the tab bar that clipped the last widget. Screens WITHOUT a tab bar below
   * them (onboarding, full-screen modals like AddSeries / InteractiveSearch)
   * pass `['top', 'bottom', 'left', 'right']` to restore the bottom inset.
   */
  edges?: readonly Edge[];
}

export function ScreenContainer({ style, children, edges, ...rest }: ScreenContainerProps) {
  const t = useTokens();
  const layout = useLayout();
  // Tablet screens use 28px horizontal padding per tablet-screens.jsx:159
  // (`padding: '16px 28px 18px'`); phone keeps 20px.
  const paddingHorizontal = layout.isTablet ? 28 : 20;
  // Tablet has no bottom tab bar (sidebar shell), so it keeps the bottom inset;
  // phones hand the bottom inset to the tab bar (see `edges` doc above).
  const resolvedEdges =
    edges ??
    (layout.isTablet
      ? (['top', 'bottom', 'left', 'right'] as const)
      : (['top', 'left', 'right'] as const));
  return (
    <SafeAreaView edges={resolvedEdges} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[{ flex: 1, paddingHorizontal }, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}
