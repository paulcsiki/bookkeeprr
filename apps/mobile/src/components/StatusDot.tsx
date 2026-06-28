import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/color';

export type StatusKind = 'ok' | 'warn' | 'err' | 'info' | 'live';

function useStatusColor(kind: StatusKind): string {
  const t = useTokens();
  return { ok: t.ok, warn: t.warn, err: t.err, info: t.info, live: t.primary }[kind];
}

// Small status indicator. With `pulse`, a halo ring behind it breathes
// (scale + fade, native-driven) for in-progress / live items.
export function StatusDot({
  kind = 'ok',
  size = 7,
  pulse = false,
}: {
  kind?: StatusKind;
  size?: number;
  pulse?: boolean;
}) {
  const color = useStatusColor(kind);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, anim]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {pulse ? (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: 999,
            backgroundColor: color,
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
          }}
        />
      ) : null}
      <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}

// Cover-overlay status disc — a tinted glass circle that flags
// download/owned/missing state in the top-right of a Cover.
export function StatusBadge({ kind = 'ok', size = 22 }: { kind?: StatusKind; size?: number }) {
  const color = useStatusColor(kind);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withAlpha(color, 0.22),
        borderWidth: 1,
        borderColor: withAlpha(color, 0.5),
      }}
    >
      <View
        style={{ width: size / 3, height: size / 3, borderRadius: 999, backgroundColor: color }}
      />
    </View>
  );
}
