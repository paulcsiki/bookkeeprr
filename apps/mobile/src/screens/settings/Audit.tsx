import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { useAuditEvents, type AuditFilter } from '@/api/hooks';
import { AuditEventRow } from '@/features/audit/AuditEventRow';
import { AuditEventDetail } from '@/features/audit/AuditEventDetail';
import type { AuditEvent } from '@/api/schemas';
import { useIsOnline } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

const FILTERS: Array<{ label: string; value: AuditFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Writes', value: 'writes' },
  { label: 'Logins', value: 'logins' },
  { label: 'Errors', value: 'errors' },
];

export default function Audit() {
  const t = useTokens();
  const navigation = useNavigation();
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [actionInput, setActionInput] = useState('');
  const [action, setAction] = useState('');
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const q = useAuditEvents({ filter, action });
  const rows = q.data?.rows ?? [];
  const online = useIsOnline();
  return (
    <ScreenContainer testID="screen-audit">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-audit" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Audit Log</Text>
        {q.data ? <Text style={[text.monoSm, { color: t.textMuted }]}>{q.data.total}</Text> : null}
      </View>
      <View style={{ paddingBottom: 10, gap: 6 }}>
        <Text style={[text.label, { color: t.textMuted }]}>Filter by action</Text>
        <TextInput
          testID="audit-action-filter"
          value={actionInput}
          onChangeText={setActionInput}
          onSubmitEditing={(e) => setAction(e.nativeEvent.text.trim())}
          returnKeyType="search"
          placeholder="e.g. added series"
          placeholderTextColor={t.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            color: t.text,
            backgroundColor: t.surface,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: t.border,
            fontFamily: fonts.sans.regular,
            fontSize: 15,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 12 }}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.value}
              testID={`audit-filter-${f.value}`}
              onPress={() => setFilter(f.value)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: active ? t.primary : t.surfaceMuted,
                borderWidth: 1,
                borderColor: active ? t.primary : t.border,
              }}
            >
              <Text style={[text.label, { color: active ? t.primaryFg : t.text }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {!online && q.data === undefined ? (
          <SettingsOfflineState />
        ) : q.isLoading ? (
          <Text
            testID="audit-loading"
            style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}
          >
            Loading…
          </Text>
        ) : q.isError ? (
          <Text
            testID="audit-error"
            style={[text.bodySm, { color: t.err, padding: 24, textAlign: 'center' }]}
          >
            Couldn&apos;t load audit events.
          </Text>
        ) : rows.length === 0 ? (
          <Text
            testID="audit-empty"
            style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}
          >
            No events match this filter.
          </Text>
        ) : (
          rows.map((e) => (
            <AuditEventRow key={e.id} event={e} onPress={() => setSelected(e)} />
          ))
        )}
      </ScrollView>
      {selected ? (
        // Absolute-fill host (EditIndexerSheet pattern) — a plain flex sibling
        // squashes the sheet to the leftover height on-device (see Matcher.tsx).
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <AuditEventDetail event={selected} onDismiss={() => setSelected(null)} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
