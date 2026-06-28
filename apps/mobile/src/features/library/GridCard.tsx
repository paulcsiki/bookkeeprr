import { View, Text, Pressable } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { hueFromString } from '@/theme/color';
import { Cover } from '@/components/Cover';
import { Pill } from '@/components/Pill';
import { StatusBadge } from '@/components/StatusDot';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import { seriesStatus, seriesMetaLine, TYPE_LABEL } from './seriesMeta';
import type { SeriesSummary } from '@/api/schemas';

interface Props {
  series: SeriesSummary;
  onPress: () => void;
  /** Phone long-press → Move-to-group sheet (tablet long-press is reserved for dnd). */
  onLongPress?: (() => void) | undefined;
  /** 0–1 progress value when a download is actively running for this series. */
  downloadProgress?: number | null;
}

export function GridCard({ series, onPress, onLongPress, downloadProgress }: Props) {
  const t = useTokens();
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const coverUri = resolveAssetUri(serverUrl, series.coverUrl);
  const status = seriesStatus(series);
  const hasLiveDownload = typeof downloadProgress === 'number' && downloadProgress >= 0;
  return (
    <Pressable
      testID={`grid-card-${series.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ marginBottom: 16 }}
    >
      <Cover uri={coverUri} hue={hueFromString(series.title)}>
        <View style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
          <Pill kind={series.contentType} size="xs">
            {TYPE_LABEL[series.contentType]}
          </Pill>
        </View>
        <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
          <StatusBadge kind={status} size={20} />
        </View>
        {hasLiveDownload ? (
          <View
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              bottom: 28,
              height: 3,
              borderRadius: 999,
              backgroundColor: t.coverProgressTrack,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.round((downloadProgress ?? 0) * 100)}%`,
                height: '100%',
                backgroundColor: t.primary,
              }}
            />
          </View>
        ) : null}
      </Cover>
      <View style={{ paddingHorizontal: 2, marginTop: 8 }}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: fonts.sans.medium,
            fontSize: 13,
            fontWeight: '500',
            lineHeight: 16.25,
            letterSpacing: -0.065, // -0.005em × 13px
            color: t.text,
          }}
        >
          {series.title}
        </Text>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 10,
            letterSpacing: 0.5, // 0.05em × 10px
            color: t.textMuted,
            marginTop: 3,
            textTransform: 'uppercase',
          }}
        >
          {seriesMetaLine(series)}
        </Text>
      </View>
    </Pressable>
  );
}
