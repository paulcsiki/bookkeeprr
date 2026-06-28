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
import { useCalibre, useSaveCalibre, useTestCalibre } from '@/api/hooks';
import { INTEGRATIONS_SECRET_SENTINEL } from '@/api/schemas';
import type { CalibreConfig, SyncTestResult } from '@/api/schemas';
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

export function CalibreCard() {
  const t = useTokens();
  const q = useCalibre();
  const save = useSaveCalibre();
  const testMut = useTestCalibre();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const config = q.data;

  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  // Password field starts empty; blank on Save = keep stored.
  const [password, setPassword] = useState('');
  const [libraryId, setLibraryId] = useState('');
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [enabled, setEnabled] = useState(false);
  // Whether the server has a password stored (GET returned the mask).
  const [passwordIsSet, setPasswordIsSet] = useState(false);

  const [seeded, setSeeded] = useState(false);
  const [testResult, setTestResult] = useState<SyncTestResult | null>(null);

  useEffect(() => {
    if (config && !seeded) {
      setBaseUrl(config.baseUrl ?? '');
      setUsername(config.username ?? '');
      setPassword('');
      setPasswordIsSet(config.password === INTEGRATIONS_SECRET_SENTINEL);
      setLibraryId(config.libraryId);
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
    const body: Omit<CalibreConfig, 'configured'> = {
      baseUrl: baseUrl === '' ? null : baseUrl,
      username: username === '' ? null : username,
      // Blank = keep stored; a new value replaces the stored one.
      password,
      libraryId,
      contentTypes,
      enabled,
    };
    save.mutate(body, {
      onSuccess: () => {
        if (password !== '') setPasswordIsSet(true);
        setPassword('');
        setSeeded(false); // Re-seed from the next GET.
      },
    });
  }

  function onTest() {
    testMut.mutate(undefined, {
      onSuccess: (result) => setTestResult(result),
      onError: () => setTestResult({ error: 'Test refresh failed unexpectedly.' }),
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
    return <InlineAlert tone="err" body="Couldn't load Calibre settings." testID="cal-load-error" />;
  }

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
      <Text style={[text.displaySm, { color: t.text }]}>Calibre</Text>

      <TextField
        testID="cal-baseurl"
        label="Base URL"
        value={baseUrl}
        onChangeText={(v) => {
          setBaseUrl(v);
          setTestResult(null);
        }}
        placeholder="https://calibre.example"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        testID="cal-username"
        label="Username"
        value={username}
        onChangeText={(v) => {
          setUsername(v);
          setTestResult(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={{ gap: 6 }}>
        <TextField
          testID="cal-password"
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setTestResult(null);
          }}
          secureTextEntry
          helper="Leave blank to keep current password"
        />
        {passwordIsSet ? (
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
              Password configured
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
              testID={`cal-ct-${ct}`}
              checked={contentTypes.includes(ct)}
              onChange={() => toggleContentType(ct)}
            />
            <Text style={[text.body, { color: t.text }]}>{CONTENT_TYPE_LABELS[ct]}</Text>
          </Pressable>
        ))}
      </View>

      <TextField
        testID="cal-library"
        label="Library ID"
        value={libraryId}
        onChangeText={(v) => {
          setLibraryId(v);
          setTestResult(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <FormField
        label="Enabled"
        helper="Refresh Calibre when ebooks are imported."
        trailing={
          <Toggle
            testID="cal-enabled"
            on={enabled}
            onChange={(next) => {
              setEnabled(next);
              setTestResult(null);
            }}
          />
        }
      />

      {save.isError ? (
        <InlineAlert tone="err" body="Couldn't save Calibre settings." testID="cal-save-error" />
      ) : null}

      <Button
        testID="cal-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(onSave)}
        disabled={save.isPending || disabledProps.disabled}
      />

      <Button
        testID="cal-test"
        label={testMut.isPending ? 'Refreshing…' : 'Send test refresh'}
        variant="secondary"
        onPress={gate(onTest)}
        disabled={testMut.isPending || disabledProps.disabled}
      />

      {testResult !== null ? (
        <InlineAlert
          testID="cal-result"
          tone={testResult.ok ? 'info' : 'err'}
          body={
            testResult.ok
              ? 'Test refresh triggered successfully.'
              : (testResult.error ?? 'Test refresh failed.')
          }
        />
      ) : null}
    </View>
  );
}
