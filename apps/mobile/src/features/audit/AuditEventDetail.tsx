import { View, Text, ScrollView } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import type { AuditEvent } from '@/api/schemas';
import { VerbBadge } from './VerbBadge';

interface Props {
  event: AuditEvent;
  onDismiss: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ gap: 4 }}>
      <Text style={[text.label, { color: t.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

export function AuditEventDetail({ event: e, onDismiss }: Props) {
  const t = useTokens();
  const actorLabel = e.actor ? `${e.actor.username} · ${e.actor.role}` : 'unknown';
  const diffColor =
    e.verb === 'delete' || e.diff.startsWith('-')
      ? t.err
      : e.verb === 'create' || e.diff.startsWith('+')
        ? t.ok
        : t.text;
  return (
    <BottomSheet testID="audit-detail-sheet" onDismiss={onDismiss}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <VerbBadge verb={e.verb} />
          <Text style={[text.displaySm, { color: t.text, flexShrink: 1 }]}>{e.action}</Text>
        </View>

        <Row label="Actor">
          <Text style={[text.monoSm, { color: t.text }]}>{actorLabel}</Text>
        </Row>

        <Row label="Target">
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: t.surfaceMuted,
              alignSelf: 'flex-start',
              maxWidth: '100%',
            }}
          >
            <Text style={[text.monoSm, { color: t.text }]}>{e.target}</Text>
          </View>
        </Row>

        <Row label="Time">
          <Text style={[text.monoSm, { color: t.text }]}>{formatTime(e.occurredAt)}</Text>
        </Row>

        <Row label="Change">
          <Text style={[text.monoSm, { color: diffColor }]}>{e.diff || '—'}</Text>
        </Row>
      </ScrollView>
    </BottomSheet>
  );
}
