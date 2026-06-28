import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { text } from '@/theme/typography';
import { useTokens } from '@/theme/ThemeProvider';
import { useToasts, dismissToast, type ToastItem, type ToastTone } from '@/state/toastStore';

// Global toast renderer for the queue in `@/state/toastStore`. Subscribes to the
// store, stacks each toast as a token-styled card near the top of the screen
// (below the status bar), and mirrors RestartToast's Reanimated fade-in. Each
// card auto-dismisses after its `durationMs` and dismisses on tap. Renders
// nothing when the queue is empty.

interface ToastCardProps {
  item: ToastItem;
}

function toneColor(tone: ToastTone, t: ReturnType<typeof useTokens>): string {
  switch (tone) {
    case 'ok':
      return t.ok;
    case 'err':
      return t.err;
    case 'info':
    default:
      return t.text;
  }
}

function ToastCard({ item }: ToastCardProps) {
  const t = useTokens();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.ease) });
  }, [opacity]);

  useEffect(() => {
    const handle = setTimeout(() => dismissToast(item.id), item.durationMs);
    return () => clearTimeout(handle);
  }, [item.id, item.durationMs]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ alignItems: 'center', width: '100%' }, animStyle]}>
      <Pressable
        testID="toast"
        accessibilityRole="button"
        accessibilityLabel={item.message}
        onPress={() => dismissToast(item.id)}
        style={{
          maxWidth: '86%',
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 99,
          paddingVertical: 10,
          paddingHorizontal: 16,
          // Border-only elevation idiom (mirrors RestartToast): no iOS
          // shadowColor so we stay hex/inline-color-free per the design system.
          elevation: 6,
        }}
      >
        <Text style={[text.label, { color: toneColor(item.tone, t) }]}>{item.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 12,
        left: 0,
        right: 0,
        zIndex: 60,
        alignItems: 'center',
        gap: 8,
      }}
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </View>
  );
}
