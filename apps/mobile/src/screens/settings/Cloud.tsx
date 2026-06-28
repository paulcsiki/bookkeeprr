import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { useMe, useCloudSettings, useCloudDisconnect } from '@/api/hooks';
import type { CloudSettings } from '@/api/schemas';
import type { SettingsStackParamList } from '@/navigation/types';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

type DisconnectedNav = NativeStackNavigationProp<SettingsStackParamList, 'Cloud'>;

function StatusBadge({ connected }: { connected: boolean }) {
  const t = useTokens();
  // SOLID badge — never translucent.
  const bg = connected ? t.ok : t.surfaceMuted;
  const fg = connected ? t.okFg : t.textMuted;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={[text.monoSm, { color: fg, fontFamily: fonts.mono.medium, letterSpacing: 0.5 }]}>
        {connected ? 'CONNECTED' : 'NOT CONNECTED'}
      </Text>
    </View>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const t = useTokens();
  return (
    <View style={{ gap: 3 }}>
      <Text style={[text.label, { color: t.textMuted }]}>{label}</Text>
      <Text
        style={[mono ? text.mono : text.body, { color: t.text }]}
        selectable
        numberOfLines={mono ? 2 : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

function ConnectedView({ config, onDisconnected }: { config: CloudSettings; onDisconnected: (devicesRemoved: number) => void }) {
  const t = useTokens();
  const disconnect = useCloudDisconnect();
  const { gate, disabledProps } = useOnlineGate();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDisconnect() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setErr(null);
    try {
      const res = await disconnect.mutateAsync();
      // Surfaced by the parent so it survives the flip to the disconnected view.
      onDisconnected(res.devicesRemoved);
    } catch {
      setErr('Could not disconnect from cloud.');
      setConfirming(false);
    }
  }

  return (
    <View testID="cloud-status" style={{ gap: 16 }}>
      <StatusBadge connected />
      {config.tenantId ? <Field label="Tenant ID" value={config.tenantId} mono /> : null}
      <Field label="Install UUID" value={config.installUuid} mono />
      <Field label="Cloud URL" value={config.cloudBaseUrl} mono />
      {config.acceptedEulaVersion ? (
        <Field label="EULA version" value={`v${config.acceptedEulaVersion}`} mono />
      ) : null}
      {config.acceptedPrivacyVersion ? (
        <Field label="Privacy version" value={`v${config.acceptedPrivacyVersion}`} mono />
      ) : null}
      {config.acceptedAt ? (
        <Field label="Accepted at" value={new Date(config.acceptedAt).toLocaleString()} />
      ) : null}

      {err ? <InlineAlert tone="err" body={err} testID="cloud-disconnect-error" /> : null}

      {confirming ? (
        <Text style={[text.bodySm, { color: t.errFg }]}>Tap again to confirm disconnect</Text>
      ) : null}
      <Button
        testID="cloud-disconnect"
        label={
          disconnect.isPending
            ? 'Disconnecting…'
            : confirming
              ? 'Tap to confirm'
              : 'Disconnect from cloud'
        }
        variant="secondary"
        onPress={gate(onDisconnect)}
        disabled={disconnect.isPending || disabledProps.disabled}
      />
    </View>
  );
}

function DisconnectedView({
  config,
  devicesRemoved,
}: {
  config: CloudSettings;
  devicesRemoved: number | null;
}) {
  const nav = useNavigation<DisconnectedNav>();
  const { gate, disabledProps } = useOnlineGate();

  return (
    <View testID="cloud-status" style={{ gap: 16 }}>
      <StatusBadge connected={false} />
      {devicesRemoved != null ? (
        <InlineAlert
          tone="info"
          body={`Disconnected. ${devicesRemoved} push device${devicesRemoved === 1 ? '' : 's'} removed.`}
          testID="cloud-disconnect-result"
        />
      ) : null}
      <Field label="Cloud URL" value={config.cloudBaseUrl} mono />
      <Field label="Install UUID" value={config.installUuid} mono />
      {config.lastRegisterError ? (
        <InlineAlert
          tone="err"
          title="Last registration error"
          body={config.lastRegisterError}
          testID="cloud-register-error"
        />
      ) : null}
      <Button
        testID="cloud-connect"
        label="Connect to cloud"
        onPress={gate(() => nav.navigate('CloudConnect'))}
        disabled={disabledProps.disabled}
      />
    </View>
  );
}

function CloudAdminView() {
  const t = useTokens();
  const q = useCloudSettings();
  const config = q.data?.config;
  const online = useIsOnline();
  const [devicesRemoved, setDevicesRemoved] = useState<number | null>(null);

  if (!online && q.data?.config === undefined) return <SettingsOfflineState />;
  if (q.isLoading || config === undefined) {
    return (
      <Text style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}>
        Loading…
      </Text>
    );
  }
  if (q.isError) {
    return (
      <View style={{ paddingTop: 8 }}>
        <InlineAlert tone="err" body="Couldn't load cloud settings." testID="cloud-load-error" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 4 }}>
      {config.enabled ? (
        <ConnectedView config={config} onDisconnected={setDevicesRemoved} />
      ) : (
        <DisconnectedView config={config} devicesRemoved={devicesRemoved} />
      )}
    </ScrollView>
  );
}

export default function Cloud() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-cloud">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-cloud" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Cloud Connection</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Cloud connection requires an administrator account."
            testID="cloud-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <CloudAdminView />
      ) : null}
    </ScreenContainer>
  );
}
