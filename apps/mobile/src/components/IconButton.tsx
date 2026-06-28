import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';

interface Props {
  children: ReactNode; // a lucide icon, already colored
  onPress?: () => void;
  onDark?: boolean; // sits over a dark/image surface (e.g. cover hero)
  badge?: boolean;
  /** Visibly dim the button to signal an unavailable action (e.g. an
   * online-only feature while offline). onPress is left wired so a gate can
   * still toast on tap. */
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

// 36px round icon button used in app bars and over cover heroes.
export function IconButton({ children, onPress, onDark, badge, disabled, accessibilityLabel, testID }: Props) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        backgroundColor: onDark ? t.onDarkSurface : t.surface,
        borderWidth: 1,
        borderColor: onDark ? t.onDarkBorder : t.border,
        // Match the dim convention used by Button.tsx for disabled controls.
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: t.primary,
          }}
        />
      ) : null}
    </Pressable>
  );
}
