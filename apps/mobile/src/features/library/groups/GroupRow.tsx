import { View, Text, Pressable, StyleSheet } from 'react-native';
import FastImage from 'react-native-fast-image';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Folder, ChevronRight } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { hueFromString } from '@/theme/color';
import type { GroupNode } from './lib';

export interface FanSeries {
  id: number;
  coverUrl: string | null;
}

interface Props {
  group: GroupNode;
  /** Up to two series whose covers fan out of the folder tile. */
  fanSeries: FanSeries[];
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}

/**
 * Mini cover chip in the folder tile's fan. Real cover when available;
 * otherwise the same hue-derived solid gradient idiom as GridCard/Cover
 * (deterministic from the series id — the fan only carries id + coverUrl).
 */
function FanChip({ series, index }: { series: FanSeries; index: number }) {
  const t = useTokens();
  const hue = hueFromString(String(series.id));
  return (
    <View
      testID={`group-fan-${series.id}`}
      style={{
        width: 12,
        height: 17,
        borderRadius: 2,
        marginLeft: index ? -5 : 0,
        transform: [{ rotate: index ? '8deg' : '-6deg' }],
        borderWidth: 1,
        borderColor: t.onDarkBorder,
        overflow: 'hidden',
      }}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={`fanbg-${series.id}`} x1="0" y1="0" x2="0.34" y2="1">
            <Stop offset="0" stopColor={`hsl(${hue} 35% 30%)`} />
            <Stop offset="1" stopColor={`hsl(${hue} 30% 14%)`} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#fanbg-${series.id})`} />
      </Svg>
      {series.coverUrl ? (
        <FastImage source={{ uri: series.coverUrl }} style={StyleSheet.absoluteFill} />
      ) : null}
    </View>
  );
}

// Library group row (phone browse) per docs/design/library-groups-screens.jsx
// MobGroupRow: 46px rounded folder tile with a ≤2-cover fan bottom-right, name,
// mono uppercase counts subline, chevron. Counts come from the group node —
// seriesCount is recursive (server fact), subgroupCount is direct children.
export function GroupRow({ group, fanSeries, onPress, onLongPress, testID }: Props) {
  const t = useTokens();
  const subs = group.subgroupCount;
  const folderPart = subs > 0 ? `${subs} ${subs === 1 ? 'FOLDER' : 'FOLDERS'} · ` : '';
  const subline = `${folderPart}${group.seriesCount} SERIES`;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          flexShrink: 0,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Folder size={19} color={t.textMuted} strokeWidth={1.7} />
        <View style={{ position: 'absolute', right: 4, bottom: 4, flexDirection: 'row' }}>
          {fanSeries.slice(0, 2).map((s, i) => (
            <FanChip key={s.id} series={s} index={i} />
          ))}
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fonts.sans.medium,
            fontSize: 15,
            fontWeight: '500',
            color: t.text,
          }}
        >
          {group.name}
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 10,
            letterSpacing: 0.6, // 0.06em × 10px
            color: t.textMuted,
            marginTop: 3,
          }}
        >
          {subline}
        </Text>
      </View>
      <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
    </Pressable>
  );
}
