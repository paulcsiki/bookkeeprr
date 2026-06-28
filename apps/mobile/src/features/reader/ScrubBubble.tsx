import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { text } from '@/theme/typography';
import { useReaderTheme } from './ReaderThemeContext';

export type ScrubPreview = {
  kind: 'text' | 'comics' | 'audio';
  chapterLabel: string;
  chapterTitle: string;
  location: string;
};

interface Props {
  preview: ScrubPreview;
  /** 0..1 position mapped to the rail. */
  position: number;
  /** Width of the rail in px (used to clamp left offset). */
  railWidth: number;
}

const BUBBLE_W = 160;

/**
 * Preview bubble shown above the rail thumb during a scrub gesture. Fades in
 * using Reanimated; positioned absolutely above the thumb center, clamped to
 * the rail edges.
 */
export function ScrubBubble({ preview, position, railWidth }: Props) {
  const { palette } = useReaderTheme();
  const opacity = useSharedValue(0);
  opacity.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) });
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const thumbX = position * railWidth;
  const half = BUBBLE_W / 2;
  const left = Math.max(0, Math.min(railWidth - BUBBLE_W, thumbX - half));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          bottom: 28,
          left,
          width: BUBBLE_W,
          zIndex: 50,
        },
        animStyle,
      ]}
    >
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette.line,
          backgroundColor: palette.chrome2,
          padding: 10,
          gap: 4,
        }}
      >
        {/* Per-kind thumbnail area */}
        <View
          style={{
            height: 60,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: palette.line,
            backgroundColor: preview.kind === 'comics'
              ? palette.chrome2
              : preview.kind === 'audio'
                ? palette.chrome
                : palette.page,
          }}
        />
        <Text style={[text.monoSm, { color: palette.inkSoft }]} numberOfLines={1}>
          {preview.chapterLabel}
        </Text>
        <Text style={[text.bodySm, { color: palette.ink, fontWeight: '500' }]} numberOfLines={1}>
          {preview.chapterTitle}
        </Text>
        <Text style={[text.monoSm, { color: palette.accent }]} numberOfLines={1}>
          {preview.location}
        </Text>
      </View>
    </Animated.View>
  );
}
