import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/color';
import { fonts } from '@/theme/typography';
import { DTYPES, DSOURCES } from '@/screens/discover/fixtures';
import { StatusDot } from '@/components/StatusDot';

const DURATION_MS = 2600;

// A deck of five book-cover cards — one per content type, in the fixed
// content-type accents — riffles/fans continuously, like shuffling a hand of
// cards. Reinforces "all five media types" while scanning the sources.
//
// Each card runs the same looped animation curve, staggered by -duration/5
// so the five cards are spread evenly through the cycle (one always at peak,
// one always falling back to the deck).
export function RiffleLoader({
  unit = 92,
  caption = true,
}: {
  unit?: number;
  caption?: boolean;
}) {
  const t = useTokens();
  const [src, setSrc] = useState(0);

  // Five independent looped progressions, one per card. Each runs 0→1 over
  // DURATION_MS. Staggering the *initial value* doesn't work — Animated.loop
  // restarts each card at 0, so after the first pass they synchronize (all five
  // fan together instead of riffling). Instead, stagger each loop's START by
  // duration/5 so the cycles stay permanently phase-offset (matching the web's
  // negative animation-delay).
  const progress = useRef(DTYPES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const stagger = DURATION_MS / DTYPES.length;
    const loops = progress.map((value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: DURATION_MS,
          easing: Easing.bezier(0.55, 0.05, 0.35, 1),
          useNativeDriver: true,
        }),
      ),
    );
    const timers = loops.map((loop, i) => setTimeout(() => loop.start(), Math.round(i * stagger)));
    return () => {
      timers.forEach((tm) => clearTimeout(tm));
      loops.forEach((l) => l.stop());
      progress.forEach((v) => v.setValue(0));
    };
  }, [progress]);

  useEffect(() => {
    if (!caption) return undefined;
    const id = setInterval(() => setSrc((s) => (s + 1) % DSOURCES.length), 520);
    return () => clearInterval(id);
  }, [caption]);

  const w = unit;
  const h = Math.round(unit * 1.4);

  return (
    <View
      style={{
        alignItems: 'center',
        gap: Math.round(unit * 0.42),
      }}
    >
      <View
        style={{
          position: 'relative',
          width: w * 2.1,
          height: h * 1.25,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {DTYPES.map((dtype, i) => {
          const value = progress[i]!;
          // Mirror the CSS keyframes (0% / 14% / 26% / 42% / 100%).
          const translateX = value.interpolate({
            inputRange: [0, 0.14, 0.26, 0.42, 1],
            outputRange: [0, 0, w * 0.78, 0, 0],
          });
          const translateY = value.interpolate({
            inputRange: [0, 0.14, 0.26, 0.42, 1],
            outputRange: [0, h * -0.07, h * -0.12, 0, 0],
          });
          const rotate = value.interpolate({
            inputRange: [0, 0.14, 0.26, 0.42, 1],
            outputRange: ['-7deg', '0deg', '13deg', '-7deg', '-7deg'],
          });
          const scale = value.interpolate({
            inputRange: [0, 0.14, 0.26, 0.42, 1],
            outputRange: [0.84, 1, 1.03, 0.84, 0.84],
          });
          const opacity = value.interpolate({
            inputRange: [0, 0.14, 0.26, 0.42, 1],
            outputRange: [0.45, 1, 1, 0.45, 0.45],
          });
          const accent = withAlpha(t[dtype.k], 1);
          return (
            <Animated.View
              key={dtype.k}
              style={{
                position: 'absolute',
                width: w,
                height: h,
                borderRadius: Math.max(5, Math.round(unit * 0.07)),
                backgroundColor: `hsl(${dtype.hue}, 38%, 16%)`,
                borderWidth: 1,
                borderColor: t.onDarkBorder,
                overflow: 'hidden',
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }, { scale }],
              }}
            >
              {/* Accent spine. */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: Math.max(3, unit * 0.045),
                  backgroundColor: accent,
                }}
              />
              {/* Title bars near the bottom — purely decorative. */}
              <View
                style={{
                  position: 'absolute',
                  left: unit * 0.16,
                  right: unit * 0.12,
                  bottom: unit * 0.16,
                  gap: unit * 0.07,
                }}
              >
                <View
                  style={{
                    height: Math.max(3, unit * 0.05),
                    width: '85%',
                    borderRadius: 99,
                    backgroundColor: withAlpha(t.coverTitle, 0.55),
                  }}
                />
                <View
                  style={{
                    height: Math.max(3, unit * 0.05),
                    width: '55%',
                    borderRadius: 99,
                    backgroundColor: withAlpha(t.coverTitle, 0.28),
                  }}
                />
              </View>
              {/* Type dot at the top-left. */}
              <View
                style={{
                  position: 'absolute',
                  top: unit * 0.1,
                  left: unit * 0.13,
                  width: unit * 0.1,
                  height: unit * 0.1,
                  borderRadius: 99,
                  backgroundColor: accent,
                }}
              />
            </Animated.View>
          );
        })}
      </View>
      {caption ? (
        <View style={{ alignItems: 'center', gap: Math.round(unit * 0.1) }}>
          <Text
            style={{
              fontFamily: fonts.display.semibold,
              fontSize: Math.round(unit * 0.2),
              letterSpacing: -0.4,
              color: t.text,
            }}
          >
            Searching every source
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <StatusDot kind="live" size={Math.round(unit * 0.08)} pulse />
            <Text
              style={{
                fontFamily: fonts.mono.medium,
                fontSize: Math.round(unit * 0.13),
                letterSpacing: 1.2,
                color: t.textMuted,
                textTransform: 'uppercase',
                minWidth: unit * 1.1,
              }}
            >
              {DSOURCES[src]}…
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
