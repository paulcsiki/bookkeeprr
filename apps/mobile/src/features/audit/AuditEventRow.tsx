import { View, Text, Pressable } from 'react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import type { AuditEvent } from '@/api/schemas';
import { VerbBadge } from './VerbBadge';

interface Props {
  event: AuditEvent;
  onPress?: () => void;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function AuditEventRow({ event: e, onPress }: Props) {
  const t = useTokens();
  const actorLabel = e.actor ? `${e.actor.username} · ${e.actor.role}` : 'unknown';
  const diffColor =
    e.verb === 'delete' || e.diff.startsWith('-')
      ? t.err
      : e.verb === 'create' || e.diff.startsWith('+')
        ? t.ok
        : t.textMuted;
  return (
    <Pressable
      testID={`audit-row-${e.id}`}
      {...(onPress ? { onPress } : {})}
      style={{
        flexDirection: 'row',
        gap: 12,
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <VerbBadge verb={e.verb} />
          <Text style={[text.label, { color: t.text }]}>{e.action}</Text>
        </View>
        <Text style={[text.monoSm, { color: t.textMuted }]}>{actorLabel}</Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: t.surfaceMuted,
            alignSelf: 'flex-start',
            maxWidth: '100%',
          }}
        >
          <Text numberOfLines={1} style={[text.monoSm, { color: t.text }]}>
            {e.target}
          </Text>
        </View>
        <Text style={[text.monoSm, { color: diffColor }]}>{e.diff}</Text>
      </View>
      <Text style={[text.monoSm, { color: t.textMuted }]}>{timeOf(e.occurredAt)}</Text>
    </Pressable>
  );
}
