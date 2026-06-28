import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { FormField } from '@/components/FormField';
import { Toggle } from '@/components/Toggle';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useCloudConnect, useCloudTerms, useCloudSettings } from '@/api/hooks';
import { ApiError } from '@/api/client';
import type { SettingsStackParamList } from '@/navigation/types';
import { useOnlineGate } from '@/features/system/online';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'CloudConnect'>;

/**
 * Full-screen consent form to connect this installation to cloud. Reachable only
 * from the disconnected cloud view; reads the cloud base URL from the same cloud
 * settings query the host screen uses, fetches the live terms, and requires both
 * the EULA and Privacy toggles before the connect mutation is enabled. Pushed
 * onto the SettingsStack; pops back on success or cancel.
 */
export default function CloudConnect() {
  const t = useTokens();
  const nav = useNavigation<Nav>();
  const settingsQuery = useCloudSettings();
  const cloudBaseUrl = settingsQuery.data?.config.cloudBaseUrl ?? null;
  const connect = useCloudConnect();
  const { gate, disabledProps } = useOnlineGate();
  const termsQuery = useCloudTerms();
  const terms = termsQuery.data?.terms ?? null;
  const [eulaOk, setEulaOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = terms !== null && eulaOk && privacyOk;

  async function submit() {
    if (!ready || !terms) return;
    setErr(null);
    try {
      await connect.mutateAsync({
        acceptedEulaVersion: terms.eulaVersion,
        acceptedPrivacyVersion: terms.privacyVersion,
      });
      nav.goBack();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? ((e.body as { message?: string })?.message ?? 'Could not connect to cloud')
          : 'Could not connect to cloud',
      );
    }
  }

  return (
    <ScreenContainer testID="screen-cloud-connect">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-cloud-connect" onPress={() => nav.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Connect to Cloud</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 4, paddingTop: 6, paddingBottom: 48, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[text.bodySm, { color: t.textMuted, lineHeight: 19 }]}>
          Connecting registers this installation and provisions a tenant ID. Push notifications and
          remote device features will be enabled.
        </Text>
        {cloudBaseUrl ? (
          <Text style={[text.mono, { color: t.textMuted }]}>{cloudBaseUrl}</Text>
        ) : settingsQuery.isLoading && !settingsQuery.isError ? (
          <Text style={[text.bodySm, { color: t.textMuted }]}>Loading…</Text>
        ) : null}

        {err ? <InlineAlert tone="err" body={err} testID="cloud-connect-error" /> : null}

        {termsQuery.isError ? (
          <InlineAlert
            tone="err"
            body="Could not fetch the current terms from cloud. Try again later."
            testID="cloud-terms-error"
          />
        ) : null}

        {!terms && !termsQuery.isError ? (
          <Text testID="cloud-terms-loading" style={[text.bodySm, { color: t.textMuted }]}>
            Loading terms…
          </Text>
        ) : null}

        {terms ? (
          <>
            <FormField
              label={`I accept the EULA (v${terms.eulaVersion})`}
              trailing={<Toggle testID="cloud-accept-eula" on={eulaOk} onChange={setEulaOk} />}
            />
            <FormField
              label={`I accept the Privacy Policy (v${terms.privacyVersion})`}
              trailing={
                <Toggle testID="cloud-accept-privacy" on={privacyOk} onChange={setPrivacyOk} />
              }
            />
          </>
        ) : null}

        <Button
          testID="cloud-connect-submit"
          label={connect.isPending ? 'Connecting…' : 'Connect'}
          onPress={gate(submit)}
          disabled={!ready || connect.isPending || disabledProps.disabled}
        />
        <Button
          testID="cloud-connect-cancel"
          label="Cancel"
          variant="ghost"
          onPress={() => nav.goBack()}
        />
      </ScrollView>
    </ScreenContainer>
  );
}
