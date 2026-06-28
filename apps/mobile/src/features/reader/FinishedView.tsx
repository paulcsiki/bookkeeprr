import { View, Text, ScrollView, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { ReaderManifest } from '@/api/schemas';
import { text } from '@/theme/typography';
import { useTokens } from '@/theme/ThemeProvider';
import { Button } from '@/components/Button';
import { useReaderTheme } from './ReaderThemeContext';

export type FinishedViewProps = {
  manifest: ReaderManifest;
  stats: {
    finishedAt: Date;
    minutesRead: number;
    pages: number;
    paceLabel: string;
  };
  upNext?: { title: string; coverUrl?: string; href?: string; kind?: string };
  onStartOver: () => void;
  onStartNext?: () => void;
  onBackToLibrary: () => void;
};

function fmtMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtRelative(d: Date): string {
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function FadeSlide({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);
  opacity.value = withDelay(delay, withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) }));
  translateY.value = withDelay(delay, withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }));
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Celebration view shown when a book reaches 100%. Mobile port of the web
 * FinishedView. Cover pop-in + ambient glow area + 4-stat strip + Up next +
 * Start/Back actions. Per chat 4: no 'Read again' button.
 */
export function FinishedView({
  manifest,
  stats,
  upNext,
  onStartOver,
  onStartNext,
  onBackToLibrary,
}: FinishedViewProps) {
  const t = useTokens();
  const { palette } = useReaderTheme();

  const popScale = useSharedValue(0.88);
  const popOpacity = useSharedValue(0);
  popScale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.2)) });
  popOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) });
  const popStyle = useAnimatedStyle(() => ({
    opacity: popOpacity.value,
    transform: [{ scale: popScale.value }],
  }));

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: palette.page,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        paddingHorizontal: 24,
        gap: 20,
      }}
    >
      {/* Cover hero */}
      <Animated.View style={[{ alignItems: 'center' }, popStyle]}>
        <View
          style={{
            width: 108,
            aspectRatio: 2 / 3,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: palette.line,
            overflow: 'hidden',
            backgroundColor: palette.chrome,
          }}
        >
          {manifest.coverUrl ? (
            <Image
              source={{ uri: manifest.coverUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : null}
        </View>
        {/* Checkmark badge */}
        <View
          style={{
            position: 'absolute',
            bottom: -8,
            right: -8,
            width: 28,
            height: 28,
            borderRadius: 99,
            backgroundColor: t.ok ?? t.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: palette.page,
          }}
        >
          <Text style={{ color: t.coverTitle, fontSize: 12, fontWeight: '700' }}>✓</Text>
        </View>
      </Animated.View>

      {/* "Finished" label */}
      <FadeSlide delay={450}>
        <Text style={[text.monoSm, { color: palette.inkSoft, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 2 }]}>
          Finished
        </Text>
      </FadeSlide>

      {/* Title */}
      <FadeSlide delay={550}>
        <Text style={[text.displayMd, { color: palette.ink, textAlign: 'center' }]}>
          {manifest.title}
        </Text>
      </FadeSlide>

      {/* Stats strip */}
      <FadeSlide delay={650}>
        <View
          style={{
            flexDirection: 'row',
            width: '100%',
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: palette.line,
            paddingVertical: 12,
          }}
        >
          {[
            { label: 'Finished', value: fmtRelative(stats.finishedAt) },
            { label: 'Time', value: fmtMinutes(stats.minutesRead) },
            { label: 'Pages', value: String(stats.pages) },
            { label: 'Pace', value: stats.paceLabel },
          ].map((item) => (
            <View key={item.label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[text.monoSm, { color: palette.inkSoft }]}>{item.label}</Text>
              <Text style={[text.mono, { color: palette.ink }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      </FadeSlide>

      {/* Up next */}
      {upNext && (
        <FadeSlide delay={800}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: palette.line,
              backgroundColor: palette.chrome,
              padding: 12,
            }}
          >
            <View
              style={{
                width: 40,
                aspectRatio: 2 / 3,
                borderRadius: 6,
                backgroundColor: palette.chrome2,
                borderWidth: 1,
                borderColor: palette.line,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[text.monoSm, { color: palette.inkSoft, textTransform: 'uppercase', letterSpacing: 1 }]}>
                Up next
              </Text>
              <Text style={[text.label, { color: palette.ink }]} numberOfLines={1}>
                {upNext.title}
              </Text>
            </View>
          </View>
        </FadeSlide>
      )}

      {/* Actions */}
      <FadeSlide delay={940}>
        <View style={{ width: '100%', gap: 8 }}>
          {upNext && onStartNext ? (
            <Button label={`Start ${upNext.title}`} onPress={onStartNext} />
          ) : (
            <Button label="Start over" onPress={onStartOver} />
          )}
          <Button
            label="Back to library"
            variant="secondary"
            onPress={onBackToLibrary}
          />
        </View>
      </FadeSlide>
    </ScrollView>
  );
}
