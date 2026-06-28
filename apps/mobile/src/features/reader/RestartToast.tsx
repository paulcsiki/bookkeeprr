import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { RefreshCw, X } from 'lucide-react-native';
import { text } from '@/theme/typography';
import { useReaderTheme } from './ReaderThemeContext';

export interface RestartToastProps {
  /** Optional dismiss handler — when provided, a close affordance is shown. */
  onDismiss?: () => void;
  compact?: boolean;
}

/**
 * "Finished last time — starting over" toast. Shown for one beat when an
 * already-finished readable is reopened and reset to the beginning. Fades in
 * using Reanimated, mirrors the web RestartToast composition.
 */
export function RestartToast({ onDismiss, compact = false }: RestartToastProps) {
  const { palette } = useReaderTheme();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.ease) });
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: compact ? 92 : 64,
          left: 0,
          right: 0,
          zIndex: 45,
          alignItems: 'center',
          pointerEvents: 'box-none' as never,
        },
        animStyle,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          maxWidth: '86%',
          backgroundColor: palette.chrome2,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: 99,
          paddingVertical: 8,
          paddingHorizontal: 14,
        }}
      >
        <RefreshCw size={15} color={palette.accent} strokeWidth={1.7} />
        <Text style={[text.label, { color: palette.ink }]}>
          Finished last time — starting over.
        </Text>
        {onDismiss && (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={{ padding: 2 }}
          >
            <X size={14} color={palette.inkSoft} strokeWidth={1.7} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}
