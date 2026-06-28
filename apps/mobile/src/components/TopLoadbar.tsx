import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTokens } from '@/theme/ThemeProvider';

type Props = { visible?: boolean; width?: number };

/**
 * Fixed 3px sliding bar for full-screen pending states. Mount at the
 * navigator root; pass `visible` for the duration of the pending work.
 */
export function TopLoadbar({ visible = false, width = 320 }: Props) {
  const t = useTokens();
  const x = useSharedValue(-width * 0.4);
  useEffect(() => {
    if (!visible) return;
    x.value = -width * 0.4;
    x.value = withRepeat(
      withTiming(width, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [visible, width, x]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: t.border,
        overflow: 'hidden',
        zIndex: 100,
      }}
    >
      <Animated.View
        style={[
          { width: width * 0.4, height: 3, backgroundColor: t.primary },
          animated,
        ]}
      />
    </View>
  );
}
