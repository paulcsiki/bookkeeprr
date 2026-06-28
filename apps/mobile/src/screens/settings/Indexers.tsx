import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import {
  useMe,
  useIndexers,
  useUpdateIndexer,
  useDeleteIndexer,
} from '@/api/hooks';
import type { IndexerView } from '@/api/schemas';
import type { SettingsStackParamList } from '@/navigation/types';
import { ProwlarrCard } from '@/features/settings/indexers/ProwlarrCard';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

/** Simple relative-time formatter (no external dep), matching the app's other screens. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const minutes = Math.floor(secs / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function IndexerRow({
  indexer,
  onToggle,
  onDelete,
  confirmDelete,
  onPress,
  disabled,
}: {
  indexer: IndexerView;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
  confirmDelete: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTokens();
  return (
    <Pressable
      testID={`indexer-row-${indexer.id}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
        opacity: indexer.enabled ? 1 : 0.6,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={[text.label, { color: t.text }]}>
            {indexer.name}
          </Text>
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: t.surfaceMuted,
            }}
          >
            <Text style={[text.monoSm, { color: t.text }]}>{indexer.kind.toUpperCase()}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={[text.monoSm, { color: t.textMuted }]}>
          {indexer.baseUrl}
        </Text>
        {indexer.lastRssAt ? (
          <Text style={[text.monoSm, { color: t.textMuted }]}>
            last RSS {relativeTime(indexer.lastRssAt)}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1 }}>
        <Toggle
          testID={`indexer-enabled-${indexer.id}`}
          on={indexer.enabled}
          onChange={onToggle}
        />
        <Pressable
          testID={`indexer-delete-${indexer.id}`}
          onPress={onDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${indexer.name}`}
        >
          <Trash2 size={18} color={confirmDelete ? t.errFg : t.textMuted} strokeWidth={1.75} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function IndexersAdminView() {
  const t = useTokens();
  const nav = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const q = useIndexers();
  const update = useUpdateIndexer();
  const del = useDeleteIndexer();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  // Second-tap-to-confirm delete: first tap arms a row, second tap fires.
  const [confirmId, setConfirmId] = useState<number | null>(null);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading) {
    return <Text style={[text.bodySm, { color: t.textMuted, paddingVertical: 16 }]}>Loading…</Text>;
  }
  if (q.isError) {
    return (
      <View style={{ paddingTop: 8 }}>
        <InlineAlert tone="err" body="Couldn't load indexers." testID="indexers-load-error" />
      </View>
    );
  }

  const indexers = q.data?.indexers ?? [];

  function onDelete(indexer: IndexerView) {
    if (confirmId !== indexer.id) {
      setConfirmId(indexer.id);
      return;
    }
    del.mutate(indexer.id, { onSettled: () => setConfirmId(null) });
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
      <ProwlarrCard />

      <Text style={[text.label, { color: t.text, marginTop: 24, marginBottom: 4 }]}>Indexers</Text>
      {indexers.length === 0 ? (
        <Text style={[text.bodySm, { color: t.textMuted, paddingVertical: 12 }]}>
          No indexers configured yet.
        </Text>
      ) : (
        indexers.map((ix) => (
          <IndexerRow
            key={ix.id}
            indexer={ix}
            confirmDelete={confirmId === ix.id}
            disabled={disabledProps.disabled}
            onToggle={gate((next: boolean) => update.mutate({ id: ix.id, enabled: next }))}
            onDelete={gate(() => onDelete(ix))}
            onPress={() => nav.navigate('EditIndexer', { indexerId: ix.id })}
          />
        ))
      )}

      <Button
        testID="indexer-add"
        label="Add indexer"
        variant="secondary"
        onPress={() => nav.navigate('EditIndexer', {})}
        style={{ marginTop: 16 }}
      />
    </ScrollView>
  );
}

export default function Indexers() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-indexers">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-indexers" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Indexers</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Indexer settings require an administrator account."
            testID="indexers-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <IndexersAdminView />
      ) : null}
    </ScreenContainer>
  );
}
