import { View, Text, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { hueFromString } from '@/theme/color';
import { Cover } from '@/components/Cover';
import { Pill } from '@/components/Pill';
import { StatusDot } from '@/components/StatusDot';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import { seriesStatus, seriesMetaLine, TYPE_LABEL } from './seriesMeta';
import type { SeriesSummary } from '@/api/schemas';

interface Props {
  series: SeriesSummary;
  onPress: () => void;
  /** Phone long-press → Move-to-group sheet (tablet long-press is reserved for dnd). */
  onLongPress?: (() => void) | undefined;
}

// List-view row matching the canonical design grid:
//   44px (cover-mini) | flex:1 (meta) | auto (chevron)
// Padding: 12px vertical × 16px horizontal. Bottom border divider.
export function ListRow({ series, onPress, onLongPress }: Props) {
  const t = useTokens();
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const coverUri = resolveAssetUri(serverUrl, series.coverUrl);
  const status = seriesStatus(series);
  return (
    <Pressable
      testID={`list-row-${series.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
        gap: 12,
      }}
    >
      {/* Cover mini: 44 × 60 (11:15 ratio) */}
      <View style={{ width: 44, height: 60 }}>
        <Cover uri={coverUri} hue={hueFromString(series.title)} size="sm" ratio={11 / 15} />
      </View>

      {/* Middle column: pill + status dot, then title, then meta */}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Pill kind={series.contentType} size="xs">
            {TYPE_LABEL[series.contentType]}
          </Pill>
          <StatusDot kind={status} pulse={status === 'live'} />
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fonts.sans.medium,
            fontSize: 13.5,
            fontWeight: '500',
            letterSpacing: -0.0675, // -0.005em × 13.5px
            color: t.text,
          }}
        >
          {series.title}
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 10.5,
            letterSpacing: 0.42, // 0.04em × 10.5px
            color: t.textMuted,
            marginTop: 2,
          }}
        >
          {seriesMetaLine(series).toUpperCase()}
        </Text>
      </View>

      {/* Right column: chevron */}
      <ChevronRight size={14} color={t.textMuted} strokeWidth={1.75} />
    </Pressable>
  );
}
