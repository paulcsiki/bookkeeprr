import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { Radio } from '@/components/Radio';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useMe, useDiscover, useSaveDiscover } from '@/api/hooks';
import type { DiscoverSettings } from '@/api/schemas/library';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

type TrendingSource = DiscoverSettings['trendingSource'];

const SOURCES: { value: TrendingSource; label: string; testID: string }[] = [
  { value: 'anilist', label: 'AniList', testID: 'discover-src-anilist' },
  { value: 'mal', label: 'MyAnimeList', testID: 'discover-src-mal' },
];

function DiscoverAdminView() {
  const t = useTokens();
  const q = useDiscover();
  const save = useSaveDiscover();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const [draft, setDraft] = useState<TrendingSource | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (q.data && !seeded) {
      setDraft(q.data.trendingSource);
      setSeeded(true);
    }
  }, [q.data, seeded]);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || q.data === undefined || !seeded || draft === null) {
    return (
      <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
        Loading…
      </Text>
    );
  }

  if (q.isError) {
    return (
      <View style={{ paddingTop: 8 }}>
        <InlineAlert
          tone="err"
          body="Couldn't load discover settings."
          testID="discover-load-error"
        />
      </View>
    );
  }

  const dirty = draft !== q.data.trendingSource;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
      <View style={{ marginTop: 8, gap: 4 }}>
        {SOURCES.map(({ value, label, testID }) => (
          <FormField
            key={value}
            label={label}
            trailing={
              <Radio
                testID={testID}
                checked={draft === value}
                onChange={() => setDraft(value)}
              />
            }
          />
        ))}
      </View>

      {save.isError ? (
        <View style={{ marginTop: 12 }}>
          <InlineAlert
            tone="err"
            body="Couldn't save discover settings."
            testID="discover-save-error"
          />
        </View>
      ) : null}

      <Button
        testID="discover-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(() => {
          if (draft !== null) save.mutate({ trendingSource: draft });
        })}
        disabled={!dirty || save.isPending || disabledProps.disabled}
        style={{ marginTop: 16 }}
      />
    </ScrollView>
  );
}

export default function Discover() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-discover">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-discover" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Discover</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Discover settings require an administrator account."
            testID="discover-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <DiscoverAdminView />
      ) : null}
    </ScreenContainer>
  );
}
