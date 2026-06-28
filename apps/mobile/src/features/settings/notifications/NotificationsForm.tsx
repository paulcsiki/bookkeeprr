import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { TextField } from '@/components/TextField';
import { Toggle } from '@/components/Toggle';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { useNotifications, useSaveNotifications, useTestNotifications } from '@/api/hooks';
import { INTEGRATIONS_SECRET_SENTINEL } from '@/api/schemas';
import type { NotificationsPatchBody, NotificationsTestResult } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

type TransportResult = NotificationsTestResult['discord'];

function ConfiguredBadge() {
  const t = useTokens();
  return (
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
        Configured
      </Text>
    </View>
  );
}

function describeResult(result: TransportResult): { tone: 'info' | 'warn' | 'err'; body: string } {
  if (result === 'ok') return { tone: 'info', body: 'Test message sent.' };
  if (result === 'not-configured') return { tone: 'warn', body: 'Not configured.' };
  return { tone: 'err', body: result.error };
}

function ChannelResult({ label, result }: { label: string; result: TransportResult }) {
  const { tone, body } = describeResult(result);
  const testID = `notif-result-${label.toLowerCase()}`;
  return <InlineAlert testID={testID} tone={tone} title={label} body={body} />;
}

export function NotificationsForm() {
  const t = useTokens();
  const q = useNotifications();
  const save = useSaveNotifications();
  const testMut = useTestNotifications();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const config = q.data;

  // Secret fields start empty; blank on Save = keep stored.
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');
  const [discordAvatarUrl, setDiscordAvatarUrl] = useState('');
  const [appriseUrl, setAppriseUrl] = useState('');
  const [eventGrabSuccess, setEventGrabSuccess] = useState(false);
  const [eventImportSuccess, setEventImportSuccess] = useState(false);
  const [eventFailure, setEventFailure] = useState(false);
  // Not exposed in the form, but preserved verbatim across saves so the server
  // does not reset it.
  const [eventUpdateAvailable, setEventUpdateAvailable] = useState(false);
  const [discordIsSet, setDiscordIsSet] = useState(false);
  const [appriseIsSet, setAppriseIsSet] = useState(false);

  const [seeded, setSeeded] = useState(false);
  const [testResult, setTestResult] = useState<NotificationsTestResult | null>(null);

  useEffect(() => {
    if (config && !seeded) {
      setDiscordWebhookUrl('');
      setDiscordIsSet(
        config.discordWebhookConfigured ||
          config.discordWebhookUrl === INTEGRATIONS_SECRET_SENTINEL,
      );
      setDiscordUsername(config.discordUsername);
      setDiscordAvatarUrl(config.discordAvatarUrl ?? '');
      setAppriseUrl('');
      setAppriseIsSet(
        config.appriseConfigured || config.appriseUrl === INTEGRATIONS_SECRET_SENTINEL,
      );
      setEventGrabSuccess(config.eventGrabSuccess);
      setEventImportSuccess(config.eventImportSuccess);
      setEventFailure(config.eventFailure);
      setEventUpdateAvailable(config.eventUpdateAvailable);
      setSeeded(true);
    }
  }, [config, seeded]);

  function onSave() {
    // Blank secret = keep stored. eventUpdateAvailable is echoed back from GET.
    // NEVER send any push* field — the body type prevents it.
    const body: NotificationsPatchBody = {
      discordWebhookUrl,
      discordUsername,
      discordAvatarUrl: discordAvatarUrl === '' ? null : discordAvatarUrl,
      appriseUrl,
      eventGrabSuccess,
      eventImportSuccess,
      eventFailure,
      eventUpdateAvailable,
    };
    save.mutate(body, {
      onSuccess: () => {
        if (discordWebhookUrl !== '') setDiscordIsSet(true);
        if (appriseUrl !== '') setAppriseIsSet(true);
        setDiscordWebhookUrl('');
        setAppriseUrl('');
        setSeeded(false); // Re-seed from the next GET.
      },
    });
  }

  function onTest() {
    testMut.mutate(undefined, {
      onSuccess: (result) => setTestResult(result),
      onError: () =>
        setTestResult({
          discord: { error: 'Test failed unexpectedly.' },
          apprise: { error: 'Test failed unexpectedly.' },
        }),
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
        body="Couldn't load notification settings."
        testID="notif-load-error"
      />
    );
  }

  return (
    <View style={{ gap: 20 }}>
      {/* Discord */}
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
        <Text style={[text.displaySm, { color: t.text }]}>Discord</Text>

        <View style={{ gap: 6 }}>
          <TextField
            testID="notif-discord-url"
            label="Webhook URL"
            value={discordWebhookUrl}
            onChangeText={(v) => {
              setDiscordWebhookUrl(v);
              setTestResult(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            helper="Leave blank to keep current webhook"
          />
          {discordIsSet ? <ConfiguredBadge /> : null}
        </View>

        <TextField
          testID="notif-discord-username"
          label="Username"
          value={discordUsername}
          onChangeText={(v) => {
            setDiscordUsername(v);
            setTestResult(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextField
          testID="notif-discord-avatar"
          label="Avatar URL"
          value={discordAvatarUrl}
          onChangeText={(v) => {
            setDiscordAvatarUrl(v);
            setTestResult(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          helper="Optional"
        />
      </View>

      {/* Apprise */}
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
        <Text style={[text.displaySm, { color: t.text }]}>Apprise</Text>

        <View style={{ gap: 6 }}>
          <TextField
            testID="notif-apprise-url"
            label="Apprise URL"
            value={appriseUrl}
            onChangeText={(v) => {
              setAppriseUrl(v);
              setTestResult(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            helper="Leave blank to keep current URL"
          />
          {appriseIsSet ? <ConfiguredBadge /> : null}
        </View>
      </View>

      {/* Events */}
      <View
        style={{
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 12,
          padding: 16,
          gap: 8,
        }}
      >
        <Text style={[text.displaySm, { color: t.text }]}>Events</Text>

        <FormField
          label="Grab success"
          helper="Notify when a release is grabbed."
          trailing={
            <Toggle
              testID="notif-evt-grab"
              on={eventGrabSuccess}
              onChange={(next) => {
                setEventGrabSuccess(next);
                setTestResult(null);
              }}
            />
          }
        />
        <FormField
          label="Import success"
          helper="Notify when a download is imported."
          trailing={
            <Toggle
              testID="notif-evt-import"
              on={eventImportSuccess}
              onChange={(next) => {
                setEventImportSuccess(next);
                setTestResult(null);
              }}
            />
          }
        />
        <FormField
          label="Failure"
          helper="Notify when a grab or import fails."
          trailing={
            <Toggle
              testID="notif-evt-failure"
              on={eventFailure}
              onChange={(next) => {
                setEventFailure(next);
                setTestResult(null);
              }}
            />
          }
        />
      </View>

      {save.isError ? (
        <InlineAlert tone="err" body="Couldn't save notification settings." testID="notif-save-error" />
      ) : null}

      <Button
        testID="notif-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(onSave)}
        disabled={save.isPending || disabledProps.disabled}
      />

      <Button
        testID="notif-test"
        label={testMut.isPending ? 'Sending…' : 'Send test'}
        variant="secondary"
        onPress={gate(onTest)}
        disabled={testMut.isPending || disabledProps.disabled}
      />

      {testResult !== null ? (
        <View testID="notif-result" style={{ gap: 8 }}>
          <ChannelResult label="Discord" result={testResult.discord} />
          <ChannelResult label="Apprise" result={testResult.apprise} />
        </View>
      ) : null}
    </View>
  );
}
