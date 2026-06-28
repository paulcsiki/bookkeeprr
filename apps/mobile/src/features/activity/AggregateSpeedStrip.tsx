import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Polyline } from 'react-native-svg';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { formatBytes, formatSpeed } from './activityMeta';
import type { Download } from '@/api/schemas';

const ACTIVE = new Set(['downloading', 'importing']);
const MAX_SAMPLES = 24;
const W = 280;
const H = 34;

// Aggregate download throughput across active torrents, with a rolling
// sparkline sampled once per refetch (`tick`). Self-hides when nothing's
// actively downloading or the server doesn't report speeds.
export function AggregateSpeedStrip({ downloads, tick }: { downloads: Download[]; tick: number }) {
  const t = useTokens();
  const active = downloads.filter((d) => ACTIVE.has(d.status) && d.downloadSpeed != null);
  const speed = active.reduce((sum, d) => sum + (d.downloadSpeed ?? 0), 0);
  const downloaded = active.reduce(
    (sum, d) => sum + (d.sizeBytes != null ? (d.progress ?? 0) * d.sizeBytes : 0),
    0,
  );
  const total = active.reduce((sum, d) => sum + (d.sizeBytes ?? 0), 0);

  const [samples, setSamples] = useState<number[]>([]);
  // Push one sample per refetch (`tick`), intentionally not on every `speed`
  // change, to keep an evenly-spaced rolling history.
  useEffect(() => {
    setSamples((prev) => [...prev, speed].slice(-MAX_SAMPLES));
  }, [tick]);

  if (active.length === 0) return null;

  const max = Math.max(1, ...samples);
  const points =
    samples.length > 1
      ? samples
          .map((v, i) => `${(i / (samples.length - 1)) * W},${H - (v / max) * H}`)
          .join(' ')
      : `0,${H} ${W},${H}`;

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginBottom: 14,
        padding: 14,
        borderRadius: 12,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: withAlpha(t.primary, 0.35),
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, letterSpacing: 1.2, color: t.textMuted }}>
          AGGREGATE · ↓ {formatSpeed(speed)}
        </Text>
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, color: t.primary }}>
          {active.length} ACTIVE
        </Text>
      </View>
      {total > 0 ? (
        <Text
          style={{
            fontFamily: fonts.display.semibold,
            fontSize: 24,
            letterSpacing: -0.6,
            color: t.text,
            marginTop: 4,
          }}
        >
          {formatBytes(downloaded)}
          <Text style={{ fontFamily: fonts.mono.regular, fontSize: 12, color: t.textMuted }}>
            {' '}
            / {formatBytes(total)}
          </Text>
        </Text>
      ) : null}
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ marginTop: 8 }}>
        <Defs>
          <LinearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.primary} stopOpacity={0.35} />
            <Stop offset="1" stopColor={t.primary} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {samples.length > 1 ? (
          <Polyline points={`0,${H} ${points} ${W},${H}`} fill="url(#spark)" stroke="none" />
        ) : null}
        <Polyline points={points} fill="none" stroke={t.primary} strokeWidth={1.5} />
      </Svg>
    </View>
  );
}
