import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { useMe, useKeySetting, useSaveKeySetting, useTestKey } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { SECRET_MASK, type KeyField } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

interface Props {
  title: string;
  description?: string;
  getPath: string;
  putPath: string;
  fieldName: KeyField;
  testPath?: string;
  optional?: boolean;
  testID?: string;
}

/**
 * Reusable, admin-gated form for a single server-side secret (an API key or
 * client id). The four metadata settings screens (ComicVine, Google Books,
 * MyAnimeList, New York Times) instantiate it with their own paths + field.
 *
 * The secret never leaves the server: the GET reports `'****'` when a value is
 * stored, the field always starts EMPTY, and saving a blank value tells the
 * server to keep what it has.
 */
function ApiKeySettingAdminView({
  description,
  getPath,
  putPath,
  fieldName,
  testPath,
  optional,
}: Omit<Props, 'testID' | 'title'>) {
  const t = useTokens();
  const q = useKeySetting(getPath, fieldName);
  const save = useSaveKeySetting(getPath, putPath, fieldName);
  const test = useTestKey(testPath ?? '', fieldName);
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || q.data === undefined) {
    return (
      <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
        Loading…
      </Text>
    );
  }
  if (q.isError) {
    return (
      <View style={{ paddingTop: 8 }}>
        <InlineAlert tone="err" body="Couldn't load this setting." testID="apikey-load-error" />
      </View>
    );
  }

  const isSet = q.data[fieldName] === SECRET_MASK;
  const statusLabel = isSet
    ? 'A key is set'
    : optional
      ? 'Optional — none set'
      : 'No key configured';
  const helper = optional
    ? 'Optional. Leave blank to keep the current value.'
    : 'Leave blank to keep the current value';

  const testResult = test.data ?? null;

  async function onSave() {
    setSaved(false);
    setSaveError(null);
    try {
      await save.mutateAsync(value);
      setSaved(true);
    } catch (e) {
      const body = e instanceof ApiError ? e.body : null;
      const msg =
        body !== null &&
        typeof body === 'object' &&
        'message' in body &&
        typeof (body as { message: unknown }).message === 'string'
          ? (body as { message: string }).message
          : 'Failed to save. Please try again.';
      setSaveError(msg);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 4, gap: 14 }}>
      {description ? (
        <Text style={[text.bodySm, { color: t.textMuted }]}>{description}</Text>
      ) : null}

      <View
        testID="apikey-status"
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          // SOLID background — `ok` (green) when set, neutral surface otherwise.
          backgroundColor: isSet ? t.ok : t.surfaceMuted,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 11,
            color: isSet ? t.okFg : t.textMuted,
          }}
        >
          {statusLabel}
        </Text>
      </View>

      <TextField
        testID="apikey-input"
        label={fieldName === 'clientId' ? 'Client ID' : 'API key'}
        value={value}
        onChangeText={setValue}
        secureTextEntry
        helper={helper}
      />

      {saved ? <InlineAlert tone="info" body="Saved." testID="apikey-saved" /> : null}

      {saveError ? (
        <InlineAlert tone="err" body={saveError} testID="apikey-save-error" />
      ) : null}

      {testResult ? (
        testResult.ok ? (
          <InlineAlert tone="info" body="Connection ok." testID="apikey-test-result" />
        ) : (
          <InlineAlert
            tone="err"
            body={testResult.error ?? 'Connection failed.'}
            testID="apikey-test-result"
          />
        )
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {testPath ? (
          <Button
            testID="apikey-test"
            label={test.isPending ? 'Testing…' : 'Test'}
            variant="secondary"
            onPress={gate(() => test.mutate(value))}
            disabled={test.isPending || disabledProps.disabled}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          testID="apikey-save"
          label={save.isPending ? 'Saving…' : 'Save'}
          onPress={gate(onSave)}
          disabled={save.isPending || disabledProps.disabled}
          style={{ flex: 1 }}
        />
      </View>
    </ScrollView>
  );
}

export function ApiKeySettingScreen({ title, testID, ...rest }: Props) {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID={testID ?? 'screen-apikey'}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="apikey-back" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>{title}</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="This setting requires an administrator account."
            testID="apikey-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <ApiKeySettingAdminView {...rest} />
      ) : null}
    </ScreenContainer>
  );
}
