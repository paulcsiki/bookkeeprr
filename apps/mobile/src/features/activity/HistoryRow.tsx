import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { Cover } from '@/components/Cover';
import { StatusDot } from '@/components/StatusDot';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import { downloadStatusKind, downloadTitle, downloadCoverUrl, downloadCoverHue } from './activityMeta';
import type { Download } from '@/api/schemas';

interface Props {
  download: Download;
}

function ageFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}M AGO`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}H AGO`;
  return `${Math.round(h / 24)}D AGO`;
}

export function HistoryRow({ download: d }: Props) {
  const t = useTokens();
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const coverUri = resolveAssetUri(serverUrl, downloadCoverUrl(d));
  const coverHue = downloadCoverHue(d);
  const failed = d.status === 'failed';
  const imported = d.status === 'imported';
  const superseded = d.status === 'superseded';
  const noteColor = failed ? t.err : imported ? t.ok : t.textMuted;
  const note = failed
    ? (d.error ?? 'FAILED')
    : imported
      ? 'IMPORTED'
      : superseded
        ? 'SUPERSEDED · REPLACED BY A BETTER RELEASE'
        : d.status.toUpperCase();
  const when = imported && d.importedAt ? ageFrom(d.importedAt) : ageFrom(d.addedAt);
  return (
    <View
      testID={`history-row-${d.id}`}
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 18,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <View style={{ width: 32 }}>
        <Cover uri={coverUri} hue={coverHue} size="sm" />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StatusDot kind={downloadStatusKind(d.status)} />
          <Text numberOfLines={1} style={[text.label, { color: t.text, flex: 1 }]}>
            {downloadTitle(d)}
          </Text>
        </View>
        <Text style={[text.monoSm, { color: noteColor }]}>{note}</Text>
      </View>
      <Text style={[text.monoSm, { color: t.textMuted }]}>{when}</Text>
    </View>
  );
}
