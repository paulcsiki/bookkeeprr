import { View, Text, Pressable } from 'react-native';
import { Check, Trash2, AlertTriangle, RefreshCw } from 'lucide-react-native';
import { Cover } from '@/components/Cover';
import { Pill } from '@/components/Pill';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import type { ContentType } from '@/api/schemas';

const TYPE_LABEL: Record<ContentType, string> = {
  manga: 'Manga', comic: 'Comic', novel: 'Novel', ebook: 'eBook', audio: 'Audio',
};

const TRANSPARENT = 'transparent';

function fmtSize(bytes: number): string {
  // Nothing on disk yet — a dash reads cleaner than a stark "0 MB".
  if (bytes <= 0) return '—';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
}

type Props = {
  title: string;
  contentType: ContentType;
  coverUrl?: string | null;
  hue: number;
  bytes: number;
  subline?: string;
  /** Offline volume count for a series group; shows "N volumes" when > 1. */
  volumeCount?: number;
  /** Incomplete/empty on-disk copy — show a re-download prompt instead of a size. */
  broken?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
};

export function DownloadRow({
  title, contentType, coverUrl, hue, bytes, subline, volumeCount = 1, broken = false,
  selectMode = false, selected = false, onToggle, onRemove,
}: Props) {
  const t = useTokens();
  // For a multi-volume series group, the volume count is the most useful subline.
  const effectiveSubline = volumeCount > 1 ? `${volumeCount} volumes` : subline;

  return (
    <Pressable
      onPress={selectMode ? onToggle : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      {selectMode ? (
        <View
          testID="dl-checkbox"
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1.5,
            borderColor: selected ? t.primary : t.border,
            backgroundColor: selected ? t.primary : TRANSPARENT,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <Check size={13} color={t.primaryFg} strokeWidth={2.5} /> : null}
        </View>
      ) : null}
      <View style={{ width: 42, height: 60 }}>
        <Cover hue={hue} uri={coverUrl ?? null} title={title} size="sm" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Pill kind={contentType}>{TYPE_LABEL[contentType]}</Pill>
        </View>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sans.medium, fontSize: 14, color: t.text }}>
          {title}
        </Text>
        {broken ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <AlertTriangle size={11} color={t.warn} />
            <Text
              testID="dl-broken"
              numberOfLines={1}
              style={{
                fontFamily: fonts.mono.regular,
                fontSize: 10,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: t.warn,
              }}
            >
              Incomplete — re-download
            </Text>
          </View>
        ) : effectiveSubline ? (
          <Text numberOfLines={1} style={{ fontFamily: fonts.mono.regular, fontSize: 10, color: t.textMuted, marginTop: 3 }}>
            {effectiveSubline}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 11.5,
            color: broken ? t.warn : t.text,
            fontWeight: '500',
          }}
        >
          {broken ? 'incomplete' : fmtSize(bytes)}
        </Text>
        {!selectMode && onRemove ? (
          <Pressable
            testID="dl-remove"
            onPress={onRemove}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: t.border,
              backgroundColor: withAlpha(t.err, 0.08),
            }}
          >
            <Trash2 size={15} color={t.err} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

type VolumeProps = {
  /** Safe-key dirname; used to build the row + action testIDs. */
  readableKey: string;
  title: string;
  bytes: number;
  /** Incomplete/empty on-disk copy — show a warning instead of a size. */
  broken?: boolean;
  /** "Nd left" countdown; rendered in mono next to the size. */
  timeLeftLabel?: string;
  onRemove?: () => void;
  /** Re-download this single volume. Hidden when offline (caller passes undefined). */
  onRedownload?: () => void;
  /** True offline → the redownload control renders disabled with a muted cue. */
  redownloadDisabled?: boolean;
};

/**
 * One volume inside an expanded series group. Indented under its series row,
 * with the volume title, on-disk size, its own time-left countdown, a Remove
 * and (online) a (Re)download. Token-only styling; mono for facts.
 */
export function DownloadVolumeRow({
  readableKey, title, bytes, broken = false, timeLeftLabel,
  onRemove, onRedownload, redownloadDisabled = false,
}: VolumeProps) {
  const t = useTokens();
  return (
    <View
      testID={`download-volume-${readableKey}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingLeft: 18,
        paddingRight: 4,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 99, backgroundColor: withAlpha(t.primary, 0.35) }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sans.medium, fontSize: 13, color: t.text }}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
          {broken ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <AlertTriangle size={10} color={t.warn} />
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 9.5, letterSpacing: 0.3, textTransform: 'uppercase', color: t.warn }}>
                incomplete
              </Text>
            </View>
          ) : (
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, color: t.textMuted }}>
              {fmtSize(bytes)}
            </Text>
          )}
          {timeLeftLabel ? (
            <Text testID="download-time-left" style={{ fontFamily: fonts.mono.regular, fontSize: 10, color: t.textMuted }}>
              {timeLeftLabel}
            </Text>
          ) : null}
        </View>
      </View>
      {onRedownload ? (
        <Pressable
          testID={`download-volume-redownload-${readableKey}`}
          onPress={onRedownload}
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.surfaceMuted,
            opacity: redownloadDisabled ? 0.4 : 1,
          }}
        >
          <RefreshCw size={14} color={t.text} />
        </Pressable>
      ) : null}
      {onRemove ? (
        <Pressable
          testID={`download-remove-volume-${readableKey}`}
          onPress={onRemove}
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: withAlpha(t.err, 0.08),
          }}
        >
          <Trash2 size={14} color={t.err} />
        </Pressable>
      ) : null}
    </View>
  );
}
