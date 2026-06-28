import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import type { ReplayRunStatus } from '@/api/schemas';

// SOLID badge — never translucent. Mirrors the Cloud screen's StatusBadge.
// `okFg` is the constant white paired to solid status backgrounds (primaryFg
// is theme-fragile here: amber/lime/mono accents ship a dark primaryFg).
export function ReplayStatusBadge({ status }: { status: ReplayRunStatus }) {
  const t = useTokens();
  const bg = status === 'completed' ? t.ok : status === 'failed' ? t.err : t.surfaceMuted;
  const fg = status === 'running' ? t.textMuted : t.okFg;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={[text.monoSm, { color: fg, fontFamily: fonts.mono.medium, letterSpacing: 0.5 }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}
