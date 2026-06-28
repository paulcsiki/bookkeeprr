import { View, Text, Pressable, StyleSheet } from 'react-native';
import FastImage from 'react-native-fast-image';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Folder } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { hueFromString, mixSolid } from '@/theme/color';
import type { GroupNode } from './lib';
import type { FanSeries } from './GroupRow';

interface Props {
  group: GroupNode;
  /** Up to three series whose covers fan in the middle of the tile. */
  fanSeries: FanSeries[];
  /** 'hot' while a dragged cover hovers this card (dashed primary + tint). */
  dropState?: 'idle' | 'hot';
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}

// Fan geometry per docs/design/library-groups-screens.jsx TabFolderCard:
// 44×64 chips, rotate [-8, 1, 8]deg, translateY [4, -3, 5]px, -22px overlap,
// middle chip on top.
const FAN_ROTATE = [-8, 1, 8] as const;
const FAN_TY = [4, -3, 5] as const;

/**
 * Mid-size cover chip in the tablet folder tile's fan. Real cover when
 * available; otherwise the hue-derived solid gradient idiom (deterministic
 * from the series id, mirroring GroupRow's FanChip / Cover).
 */
function FanCover({ series, index }: { series: FanSeries; index: number }) {
  const t = useTokens();
  const hue = hueFromString(String(series.id));
  return (
    <View
      testID={`folder-fan-${series.id}`}
      style={{
        width: 44,
        height: 64,
        borderRadius: 4,
        overflow: 'hidden',
        marginLeft: index ? -22 : 0,
        zIndex: index === 1 ? 2 : 1,
        transform: [{ rotate: `${FAN_ROTATE[index] ?? 0}deg` }, { translateY: FAN_TY[index] ?? 0 }],
        borderWidth: 1,
        borderColor: t.onDarkBorder,
      }}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={`folderfan-${series.id}`} x1="0" y1="0" x2="0.34" y2="1">
            <Stop offset="0" stopColor={`hsl(${hue} 35% 26%)`} />
            <Stop offset="1" stopColor={`hsl(${hue} 30% 12%)`} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#folderfan-${series.id})`} />
      </Svg>
      {series.coverUrl ? (
        <FastImage source={{ uri: series.coverUrl }} style={StyleSheet.absoluteFill} />
      ) : null}
    </View>
  );
}

/**
 * Tablet folder card per docs/design/library-groups-screens.jsx TabFolderCard:
 * a 2/3-aspect tile (solid surface→bg gradient), folder glyph top-left, a
 * ≤3-cover rotated fan, then name + mono uppercase counts below. While a drag
 * hovers it (`dropState='hot'`) the tile swaps to a dashed primary border, a
 * SOLID primary-tinted background (mixSolid — no alpha backgrounds), and a
 * centered mono "DROP TO MOVE HERE" hint.
 */
export function FolderCard({
  group,
  fanSeries,
  dropState = 'idle',
  onPress,
  onLongPress,
  testID,
}: Props) {
  const t = useTokens();
  const hot = dropState === 'hot';
  const subs = group.subgroupCount;
  const folderPart = subs > 0 ? `${subs} ${subs === 1 ? 'FOLDER' : 'FOLDERS'} · ` : '';
  const subline = `${folderPart}${group.seriesCount} SERIES`;
  return (
    <Pressable
      testID={testID ?? `folder-card-${group.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ marginBottom: 16 }}
    >
      <View
        style={{
          aspectRatio: 2 / 3,
          borderRadius: 10,
          position: 'relative',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderStyle: hot ? 'dashed' : 'solid',
          borderColor: hot ? t.primary : t.border,
          backgroundColor: hot ? mixSolid(t.primary, t.surface, 0.16) : undefined,
        }}
      >
        {!hot ? (
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id={`folderbg-${group.id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={t.surface} />
                <Stop offset="1" stopColor={t.bg} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#folderbg-${group.id})`} />
          </Svg>
        ) : null}
        <View style={{ position: 'absolute', top: 10, left: 10 }}>
          <Folder size={15} color={t.textMuted} strokeWidth={1.7} />
        </View>
        <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center' }}>
          {fanSeries.slice(0, 3).map((s, i) => (
            <FanCover key={s.id} series={s} index={i} />
          ))}
        </View>
        {hot ? (
          <Text
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 10,
              textAlign: 'center',
              fontFamily: fonts.mono.regular,
              fontSize: 9,
              letterSpacing: 0.72, // 0.08em × 9px
              color: t.primary,
            }}
          >
            DROP TO MOVE HERE
          </Text>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 2, marginTop: 8 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fonts.sans.medium,
            fontSize: 12.5,
            fontWeight: '500',
            lineHeight: 15.6,
            color: t.text,
          }}
        >
          {group.name}
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 9.5,
            letterSpacing: 0.48, // 0.05em × 9.5px
            color: t.textMuted,
            marginTop: 3,
          }}
        >
          {subline}
        </Text>
      </View>
    </Pressable>
  );
}
