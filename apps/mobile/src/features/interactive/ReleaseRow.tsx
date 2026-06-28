import { View, Text } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { Button } from '@/components/Button';
import type { ReleaseRow as ReleaseRowData } from '@/api/schemas';

interface Props {
  release: ReleaseRowData;
  onGrab: () => void;
  grabbing: boolean;
  /**
   * Offline disable: dims the Grab button and reports it as disabled to
   * accessibility, but (unlike `grabbing`) still lets the press fire so the
   * gated `onGrab` can toast "Unavailable offline". `grabbing` blocks the press.
   */
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  if (mib >= 1024) return `${(mib / 1024).toFixed(1)} GiB`;
  return `${mib.toFixed(0)} MiB`;
}

function ageFrom(publishedAt: string): string {
  const ms = Date.now() - new Date(publishedAt).getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function ReleaseRow({ release, onGrab, grabbing, disabled = false }: Props) {
  const t = useTokens();
  const accepted = release.accepted;
  return (
    <View
      testID={`release-${release.releaseId}`}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
        opacity: accepted ? 1 : 0.55,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            backgroundColor: release.recommended ? t.primary : t.surfaceMuted,
          }}
        >
          <Text style={[text.monoSm, { color: release.recommended ? t.primaryFg : t.text }]}>
            {release.quality}
          </Text>
        </View>
        {release.recommended ? (
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: t.primary,
            }}
          >
            <Text style={[text.monoSm, { color: t.primaryFg }]}>RECOMMENDED</Text>
          </View>
        ) : null}
        <Text style={[text.monoSm, { color: t.textMuted, marginLeft: 'auto' }]}>
          {release.indexer}
        </Text>
      </View>
      <Text style={[text.mono, { color: t.text }]}>{release.title}</Text>
      {release.rejectionReason ? (
        <Text style={[text.bodySm, { color: t.warn }]}>{release.rejectionReason}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={[text.monoSm, { color: t.textMuted }]}>
          {formatSize(release.sizeBytes).toUpperCase()}
        </Text>
        <Text style={[text.monoSm, { color: t.textMuted }]}>
          {release.seeders}/{release.leechers}
        </Text>
        <Text style={[text.monoSm, { color: t.textMuted }]}>
          {ageFrom(release.publishedAt).toUpperCase()}
        </Text>
        <View style={{ marginLeft: 'auto' }}>
          <Button
            testID={`btn-grab-${release.releaseId}`}
            label={grabbing ? '…' : accepted ? 'Grab' : 'Override'}
            variant={accepted ? 'primary' : 'secondary'}
            onPress={onGrab}
            // `grabbing` truly blocks the press (in-flight grab). The offline
            // `disabled` must NOT block the press — it still fires so the gated
            // `onGrab` can toast "Unavailable offline" — but the control must
            // read as disabled to accessibility and be dimmed. Passing
            // `disabled={undefined}` (not `false`) keeps Pressable from forcing
            // `accessibilityState.disabled`, letting the explicit one govern it.
            disabled={grabbing || undefined}
            accessibilityState={{ disabled: grabbing || disabled }}
            style={{ paddingHorizontal: 14, paddingVertical: 6, opacity: disabled ? 0.45 : undefined }}
          />
        </View>
      </View>
    </View>
  );
}
