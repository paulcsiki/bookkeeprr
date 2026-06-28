import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { FormField } from '@/components/FormField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useMe, useSearchProviders, useSaveSearchProviders } from '@/api/hooks';
import type { SearchProviders as SearchProvidersType } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

const PROVIDERS: { key: keyof SearchProvidersType; label: string }[] = [
  { key: 'anilist', label: 'AniList' },
  { key: 'mal', label: 'MyAnimeList' },
  { key: 'mangadex', label: 'MangaDex' },
  { key: 'comicvine', label: 'ComicVine' },
  { key: 'openlibrary', label: 'Open Library' },
  { key: 'audnex', label: 'Audnex' },
  { key: 'novelupdates', label: 'NovelUpdates' },
];

function SearchProvidersAdminView() {
  const t = useTokens();
  const q = useSearchProviders();
  const save = useSaveSearchProviders();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const [draft, setDraft] = useState<SearchProvidersType | null>(null);

  // Seed draft once the config loads (only on first load — preserve user edits).
  useEffect(() => {
    if (q.data && draft === null) setDraft(q.data);
  }, [q.data, draft]);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || q.data === undefined || draft === null) {
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
          body="Couldn't load search provider settings."
          testID="sp-load-error"
        />
      </View>
    );
  }

  const dirty =
    q.data !== null &&
    PROVIDERS.some(({ key }) => draft[key] !== q.data![key]);

  function toggle(key: keyof SearchProvidersType) {
    setDraft((prev) => prev ? { ...prev, [key]: !prev[key] } : prev);
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 4, gap: 4 }}>
      <View style={{ marginTop: 8, gap: 4 }}>
        {PROVIDERS.map(({ key, label }) => (
          <FormField
            key={key}
            label={label}
            trailing={
              <Toggle
                testID={`sp-${key}`}
                on={draft[key]}
                onChange={() => toggle(key)}
              />
            }
          />
        ))}
      </View>

      {save.isError ? (
        <View style={{ marginTop: 12 }}>
          <InlineAlert
            tone="err"
            body="Couldn't save search provider settings."
            testID="sp-save-error"
          />
        </View>
      ) : null}

      <Button
        testID="sp-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(() => { if (draft) save.mutate(draft); })}
        disabled={!dirty || save.isPending || disabledProps.disabled}
        style={{ marginTop: 16 }}
      />
    </ScrollView>
  );
}

export default function SearchProviders() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-search-providers">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable
          testID="btn-back-search-providers"
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Search Providers</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Search provider settings require an administrator account."
            testID="sp-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <SearchProvidersAdminView />
      ) : null}
    </ScreenContainer>
  );
}
