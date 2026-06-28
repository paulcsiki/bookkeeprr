import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { Cover } from '@/components/Cover';
import { StatusDot } from '@/components/StatusDot';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import {
  downloadStatusKind,
  downloadTitle,
  downloadCoverUrl,
  downloadCoverHue,
  formatBytes,
  formatSpeed,
  formatEta,
} from './activityMeta';
import type { Download } from '@/api/schemas';

interface Props {
  download: Download;
}

export function QueueRow({ download: d }: Props) {
  const t = useTokens();
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const coverUri = resolveAssetUri(serverUrl, downloadCoverUrl(d));
  const coverHue = downloadCoverHue(d);
  const live = d.status === 'downloading' || d.status === 'importing';
  const hasProgress = d.progress != null;
  const pct = Math.round((d.progress ?? 0) * 100);
  const eta = formatEta(d.eta);
  const peers =
    d.seeds != null
      ? `${d.seeds} SEEDS${d.downloadSpeed ? ` · ${formatSpeed(d.downloadSpeed).toUpperCase()}` : ''}`
      : null;

  return (
    <View
      testID={`queue-row-${d.id}`}
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <View style={{ width: 44 }}>
        <Cover uri={coverUri} hue={coverHue} size="sm" />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StatusDot kind={downloadStatusKind(d.status)} pulse={live} />
          <Text style={[text.monoSm, { color: t.textMuted }]}>{d.status.toUpperCase()}</Text>
        </View>
        <Text numberOfLines={1} style={[text.label, { color: t.text }]}>
          {downloadTitle(d)}
        </Text>

        {hasProgress ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
              <Text style={[text.monoSm, { color: t.textMuted }]}>
                {d.sizeBytes != null
                  ? `${formatBytes((d.progress ?? 0) * d.sizeBytes)} / ${formatBytes(d.sizeBytes)}`
                  : `${pct}%`}
              </Text>
              {eta ? <Text style={[text.monoSm, { color: t.textMuted }]}>{eta}</Text> : null}
            </View>
            <View
              style={{
                height: 3,
                borderRadius: 999,
                marginTop: 4,
                backgroundColor: withAlpha(t.textMuted, 0.25),
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: live ? t.primary : t.textMuted,
                }}
              />
            </View>
            {peers ? (
              <Text style={[text.monoSm, { color: t.textMuted, marginTop: 4 }]}>{peers}</Text>
            ) : null}
          </>
        ) : d.release ? (
          <Text numberOfLines={1} style={[text.monoSm, { color: t.textMuted }]}>
            {d.release.title}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
