import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import type { ContentType } from '@/api/schemas';

const TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga',
  comic: 'Comic',
  novel: 'Novel',
  ebook: 'eBook',
  audio: 'Audio',
};
const TYPE_ORDER: ContentType[] = ['manga', 'comic', 'novel', 'ebook', 'audio'];
const DEVICE_GB = 64;

export function fmtSize(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
}

type Props = {
  totalBytes: number;
  byType: Record<ContentType, number>;
};

export function StorageMeter({ totalBytes, byType }: Props) {
  const t = useTokens();
  const totalDevice = DEVICE_GB * 1024 * 1024 * 1024;
  const freeBytes = Math.max(0, totalDevice - totalBytes);
  const segments = TYPE_ORDER
    .map((k) => ({ k, bytes: byType[k] }))
    .filter((s) => s.bytes > 0);
  const colorFor = (k: ContentType): string =>
    k === 'manga' ? t.manga :
    k === 'comic' ? t.comic :
    k === 'novel' ? t.novel :
    k === 'ebook' ? t.ebook :
    t.audio;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontFamily: fonts.display.semibold, fontSize: 22, letterSpacing: -0.5, color: t.text }}>
            {fmtSize(totalBytes)}
          </Text>
          <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, color: t.textMuted }}>
            in downloads
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {fmtSize(freeBytes)} free
        </Text>
      </View>
      <View
        testID="storage-meter-bar"
        style={{
          flexDirection: 'row',
          height: 12,
          borderRadius: 99,
          overflow: 'hidden',
          backgroundColor: t.surfaceMuted,
          borderWidth: 1,
          borderColor: t.border,
        }}
      >
        {segments.map((s, i) => (
          <View
            key={s.k}
            testID={`storage-segment-${s.k}`}
            style={{
              flex: s.bytes,
              backgroundColor: colorFor(s.k),
              borderRightWidth: i < segments.length - 1 ? 1.5 : 0,
              borderRightColor: t.bg,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, columnGap: 14, rowGap: 8 }}>
        {segments.map((s) => (
          <View key={s.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: colorFor(s.k) }} />
            <Text style={{ fontSize: 12, fontFamily: fonts.sans.medium, color: t.text }}>{TYPE_LABEL[s.k]}</Text>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, color: t.textMuted }}>{fmtSize(s.bytes)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
