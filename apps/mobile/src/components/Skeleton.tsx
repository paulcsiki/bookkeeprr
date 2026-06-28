import { View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { useTokens } from '@/theme/ThemeProvider';

export type SkeletonVariant = 'line' | 'cover' | 'chip' | 'circle' | 'card' | 'listrow';

type Props = {
  variant?: SkeletonVariant;
  width?: DimensionValue;
  height?: DimensionValue;
  style?: ViewStyle;
  testID?: string;
};

function shapeStyle(variant: SkeletonVariant): ViewStyle {
  switch (variant) {
    case 'cover':
      return { aspectRatio: 3 / 4, width: '100%', borderRadius: 8 };
    case 'chip':
      return { height: 20, width: 64, borderRadius: 999 };
    case 'circle':
      return { borderRadius: 9999 };
    case 'line':
    default:
      return { height: 10, borderRadius: 999 };
  }
}

export function Skeleton({ variant = 'line', width, height, style, testID }: Props) {
  const t = useTokens();
  const opacity = useSharedValue(0.6);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (variant === 'card') {
    return (
      <View testID={testID} style={[{ flexDirection: 'column', gap: 10 }, style]}>
        <Skeleton variant="cover" />
        <Skeleton variant="line" width="80%" />
        <Skeleton variant="line" width="50%" />
      </View>
    );
  }
  if (variant === 'listrow') {
    return (
      <View
        testID={testID}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 12,
            borderTopWidth: 1,
            borderTopColor: t.border,
          },
          style,
        ]}
      >
        <Skeleton variant="circle" width={30} height={40} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton variant="line" width="70%" />
          <Skeleton variant="line" width="40%" />
        </View>
        <Skeleton variant="chip" />
      </View>
    );
  }

  return (
    <Animated.View
      testID={testID}
      style={[
        shapeStyle(variant),
        { backgroundColor: t.surfaceMuted, width, height },
        animated,
        style,
      ]}
    />
  );
}
