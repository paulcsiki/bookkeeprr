import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Toggle } from '@/components/Toggle';
import { FormField } from '@/components/FormField';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { useMe, useQbt, useSaveQbt, useTestQbt } from '@/api/hooks';
import { parseIntInRange } from '@/lib/parse-int-range';
import { SECRET_MASK } from '@/api/schemas/sources';
import type { QbtTestResult } from '@/api/schemas';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

function QBittorrentAdminView() {
  const t = useTokens();
  const q = useQbt();
  const save = useSaveQbt();
  const testMut = useTestQbt();
  const online = useIsOnline();
  const { gate, disabledProps } = useOnlineGate();

  const config = q.data;

  const [host, setHost] = useState('');
  const [portStr, setPortStr] = useState('8080');
  const [username, setUsername] = useState('');
  // Password field starts empty; blank on Save = keep stored.
  const [password, setPassword] = useState('');
  const [useHttps, setUseHttps] = useState(false);
  // Whether the server has a password stored (GET returned '****').
  const [passwordIsSet, setPasswordIsSet] = useState(false);

  const [seeded, setSeeded] = useState(false);
  const [testResult, setTestResult] = useState<QbtTestResult | null>(null);

  // Seed editable draft once the config loads (only on first load).
  useEffect(() => {
    if (config && !seeded) {
      setHost(config.host);
      setPortStr(String(config.port));
      setUsername(config.username);
      // Never pre-fill the password field with the sentinel.
      setPassword('');
      setPasswordIsSet(config.password === SECRET_MASK);
      setUseHttps(config.useHttps);
      setSeeded(true);
    }
  }, [config, seeded]);

  if (!online && q.data === undefined) return <SettingsOfflineState />;
  if (q.isLoading || config === undefined || !seeded) {
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
          body="Couldn't load qBittorrent settings."
          testID="qbt-load-error"
        />
      </View>
    );
  }

  const portResult = parseIntInRange(portStr, 1, 65535);
  const portError = portResult.ok ? undefined : portResult.error;

  const dirty =
    host !== config.host ||
    portStr !== String(config.port) ||
    username !== config.username ||
    password !== '' ||
    useHttps !== config.useHttps;

  const canSave = dirty && portResult.ok && !save.isPending;

  function onSave() {
    if (!portResult.ok) return;
    save.mutate(
      {
        host,
        port: portResult.value,
        username,
        // Blank = keep stored; a new value replaces the stored one.
        password,
        useHttps,
      },
      {
        onSuccess: () => {
          // After a successful save, reset the password field and indicator.
          setPassword('');
          // If the user had set a new password, now the indicator should show.
          if (password !== '') setPasswordIsSet(true);
          setSeeded(false); // Re-seed from the next GET.
        },
      },
    );
  }

  function onTest() {
    const port = portResult.ok ? portResult.value : (config?.port ?? 8080);
    const vars = {
      host,
      port,
      username,
      useHttps,
      ...(password !== '' ? { password } : {}),
    };
    testMut.mutate(vars, {
      onSuccess: (result) => setTestResult(result),
      onError: () =>
        setTestResult({ ok: false, error: 'Connection test failed unexpectedly.' }),
    });
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4 }}>
      <View style={{ marginTop: 8, gap: 14 }}>
        <TextField
          testID="qbt-host"
          label="Host"
          value={host}
          onChangeText={(v) => { setHost(v); setTestResult(null); }}
          placeholder="192.168.1.1"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          testID="qbt-port"
          label="Port"
          value={portStr}
          onChangeText={(v) => { setPortStr(v); setTestResult(null); }}
          keyboardType="number-pad"
          {...(portError !== undefined ? { error: portError } : { helper: 'Range 1–65535' })}
        />
        <TextField
          testID="qbt-username"
          label="Username"
          value={username}
          onChangeText={(v) => { setUsername(v); setTestResult(null); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ gap: 6 }}>
          <TextField
            testID="qbt-password"
            label="Password"
            value={password}
            onChangeText={(v) => { setPassword(v); setTestResult(null); }}
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
                  {
                    color: t.okFg,
                    fontFamily: fonts.mono.medium,
                    letterSpacing: 0.5,
                  },
                ]}
              >
                Password is set
              </Text>
            </View>
          ) : null}
        </View>
        <FormField
          label="Use HTTPS"
          helper="Enable for TLS-secured qBittorrent Web UI connections."
          trailing={
            <Toggle
              testID="qbt-https"
              on={useHttps}
              onChange={(next) => { setUseHttps(next); setTestResult(null); }}
            />
          }
        />
      </View>

      {save.isError ? (
        <View style={{ marginTop: 14 }}>
          <InlineAlert
            tone="err"
            body="Couldn't save qBittorrent settings."
            testID="qbt-save-error"
          />
        </View>
      ) : null}

      <Button
        testID="qbt-save"
        label={save.isPending ? 'Saving…' : 'Save'}
        onPress={gate(onSave)}
        disabled={!canSave || disabledProps.disabled}
        style={{ marginTop: 16 }}
      />

      <Button
        testID="qbt-test"
        label={testMut.isPending ? 'Testing…' : 'Test Connection'}
        variant="secondary"
        onPress={gate(onTest)}
        disabled={testMut.isPending || disabledProps.disabled}
        style={{ marginTop: 10 }}
      />

      {testResult !== null ? (
        <View style={{ marginTop: 14 }}>
          <InlineAlert
            testID="qbt-test-result"
            tone={testResult.ok ? 'info' : 'err'}
            body={
              testResult.ok
                ? 'Connection successful.'
                : (testResult.error ?? 'Connection test failed.')
            }
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

export default function QBittorrent() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-qbittorrent">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-qbittorrent" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>qBittorrent</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="qBittorrent settings require an administrator account."
            testID="qbt-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <QBittorrentAdminView />
      ) : null}
    </ScreenContainer>
  );
}
