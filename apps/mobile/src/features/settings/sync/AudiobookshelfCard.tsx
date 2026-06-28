import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { TextField } from '@/components/TextField';
import { Toggle } from '@/components/Toggle';
import { Checkbox } from '@/components/Checkbox';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import {
  useAudiobookshelf,
  useSaveAudiobookshelf,
  useAudiobookshelfLibraries,
  useTestAudiobookshelf,
} from '@/api/hooks';
import { INTEGRATIONS_SECRET_SENTINEL } from '@/api/schemas';
import type { AudiobookshelfConfig, SyncTestResult } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

const CONTENT_TYPES = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  manga: 'Manga',
  comic: 'Comic',
  light_novel: 'Light novel',
  ebook: 'eBook',
  audiobook: 'Audiobook',
};

export function AudiobookshelfCard() {
  const t = useTokens();
  const q = useAudiobookshelf();
  const save = useSaveAudiobookshelf();
  const testMut = useTestAudiobookshelf();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const config = q.data;
  const configured = config?.configured ?? false;

  // Rules of hooks: always call the libraries hook; gate it with `enabled`.
  const libs = useAudiobookshelfLibraries({ enabled: configured });

  const [baseUrl, setBaseUrl] = useState('');
  // Token field starts empty; blank on Save = keep stored.
  const [apiToken, setApiToken] = useState('');
  const [libraryId, setLibraryId] = useState('');
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [enabled, setEnabled] = useState(false);
  // Whether the server has a token stored (GET returned the mask).
  const [tokenIsSet, setTokenIsSet] = useState(false);

  const [seeded, setSeeded] = useState(false);
  const [testResult, setTestResult] = useState<SyncTestResult | null>(null);

  useEffect(() => {
    if (config && !seeded) {
      setBaseUrl(config.baseUrl ?? '');
      setApiToken('');
      setTokenIsSet(config.apiToken === INTEGRATIONS_SECRET_SENTINEL);
      setLibraryId(config.libraryId ?? '');
      setContentTypes([...config.contentTypes]);
      setEnabled(config.enabled);
      setSeeded(true);
    }
  }, [config, seeded]);

  function toggleContentType(ct: ContentType) {
    setTestResult(null);
    setContentTypes((prev) =>
      prev.includes(ct) ? prev.filter((x) => x !== ct) : [...prev, ct],
    );
  }

  function onSave() {
    const body: Omit<AudiobookshelfConfig, 'configured'> = {
      baseUrl: baseUrl === '' ? null : baseUrl,
      // Blank = keep stored; a new value replaces the stored one.
      apiToken,
      libraryId: libraryId === '' ? null : libraryId,
      contentTypes,
      enabled,
    };
    save.mutate(body, {
      onSuccess: () => {
        if (apiToken !== '') setTokenIsSet(true);
        setApiToken('');
        setSeeded(false); // Re-seed from the next GET.
      },
    });
  }

  function onTest() {
    testMut.mutate(undefined, {
      onSuccess: (result) => setTestResult(result),
      onError: () => setTestResult({ error: 'Test scan failed unexpectedly.' }),
    });
  }

  if (!online && config === undefined) return <SettingsOfflineState />;
  if (q.isLoading || config === undefined || !seeded) {
    return (
      <View
        style={{
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 12,
          padding: 16,
        }}
      >
        <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center' }]}>Loading…</Text>
      </View>
    );
  }

  if (q.isError) {
    return (
      <InlineAlert
        tone="err"
        body="Couldn't load Audiobookshelf settings."
        testID="abs-load-error"
      />
    );
  }

  const libraryOptions = libs.data?.libraries ?? [];

  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 12,
        padding: 16,
        gap: 14,
      }}
    >
      <Text style={[text.displaySm, { color: t.text }]}>Audiobookshelf</Text>

      <TextField
        testID="abs-baseurl"
        label="Base URL"
        value={baseUrl}
        onChangeText={(v) => {
          setBaseUrl(v);
          setTestResult(null);
        }}
        placeholder="https://audiobookshelf.example"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={{ gap: 6 }}>
        <TextField
          testID="abs-token"
          label="API token"
          value={apiToken}
          onChangeText={(v) => {
            setApiToken(v);
            setTestResult(null);
          }}
          secureTextEntry
          helper="Leave blank to keep current token"
        />
        {tokenIsSet ? (
          <View
            style={{
              backgroundColor: t.ok,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 3,
              alignSelf: 'flex-start',
            }}
          >
            <Text
              style={[
                text.monoSm,
                { color: t.okFg, fontFamily: fonts.mono.medium, letterSpacing: 0.5 },
              ]}
            >
              Token configured
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={[text.label, { color: t.textMuted }]}>Content types</Text>
        {CONTENT_TYPES.map((ct) => (
          <Pressable
            key={ct}
            onPress={() => toggleContentType(ct)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}
          >
            <Checkbox
              testID={`abs-ct-${ct}`}
              checked={contentTypes.includes(ct)}
              onChange={() => toggleContentType(ct)}
            />
            <Text style={[text.body, { color: t.text }]}>{CONTENT_TYPE_LABELS[ct]}</Text>
          </Pressable>
        ))}
      </View>

      {configured ? (
        <View style={{ gap: 8 }}>
          <Text style={[text.label, { color: t.textMuted }]}>Library</Text>
          {libs.isLoading ? (
            <Text style={[text.bodySm, { color: t.textMuted }]}>Loading libraries…</Text>
          ) : libraryOptions.length === 0 ? (
            <Text style={[text.bodySm, { color: t.textMuted }]}>No libraries found.</Text>
          ) : (
            libraryOptions.map((lib) => {
              const selected = libraryId === lib.id;
              return (
                <Pressable
                  key={lib.id}
                  testID={`abs-library-${lib.id}`}
                  onPress={() => {
                    setLibraryId(lib.id);
                    setTestResult(null);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    backgroundColor: selected ? t.primary : t.surfaceMuted,
                    borderColor: selected ? t.primary : t.border,
                  }}
                >
                  <Text
                    style={[
                      text.body,
                      { flex: 1, color: selected ? t.primaryFg : t.text },
                    ]}
                  >
                    {lib.name}
                  </Text>
                  <Text
                    style={[
                      text.monoSm,
                      { color: selected ? t.primaryFg : t.textMuted },
                    ]}
                  >
                    {lib.mediaType}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : (
        <TextField
          testID="abs-library"
          label="Library ID"
          value={libraryId}
          onChangeText={(v) => {
            setLibraryId(v);
            setTestResult(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          helper="Saved once connected; pick from a list after configuring."
        />
      )}

      <FormField
        label="Enabled"
        helper="Sync grabbed audiobooks to Audiobookshelf."
        trailing={
          <Toggle
            testID="abs-enabled"
            on={enabled}
            onChange={(next) => {
              setEnabled(next);
              setTestResult(null);
            }}
          />
        }
      />

      {save.isError ? (
        <InlineAlert tone="err" body="Couldn't save Audiobookshelf settings." testID="abs-save-error" />
      ) : null}

      <Button
        testID="abs-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(onSave)}
        disabled={save.isPending || disabledProps.disabled}
      />

      <Button
        testID="abs-test"
        label={testMut.isPending ? 'Scanning…' : 'Send test scan'}
        variant="secondary"
        onPress={gate(onTest)}
        disabled={testMut.isPending || disabledProps.disabled}
      />

      {testResult !== null ? (
        <InlineAlert
          testID="abs-result"
          tone={testResult.ok ? 'info' : 'err'}
          body={
            testResult.ok
              ? 'Test scan triggered successfully.'
              : (testResult.error ?? 'Test scan failed.')
          }
        />
      ) : null}
    </View>
  );
}
