// Settings → Push Notifications screen.
//
// Renders one of three primary states based on (a) whether the server
// advertises `push_enabled` via the handshake and (b) whether the user has
// opted in locally:
//   * disabled-server — server hasn't enabled cloud relay; explanatory card.
//   * off — server is ready, user hasn't opted in; "Enable" + "what we send".
//   * on — opted in with a registered token; FCM token block + "Disable".
// Enable failures surface a tone-coded InlineAlert (permission denied / 500).

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, AlertTriangle } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { StatusDot } from '@/components/StatusDot';
import { InlineAlert, type AlertTone } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { useAuth } from '@/auth/AuthContext';
import { handshake } from '@/api/anon-client';
import { PushService } from '@/push/PushService';
import { usePushState, PUSH_STATE_QUERY_KEY } from '@/push/usePushState';
import { loadNotificationHistory, type NotificationHistoryEntry } from '@/push/notificationHistory';
import { useOnlineGate } from '@/features/system/online';

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  serverPushEnabled?: boolean;
}

type PushError = { tone: AlertTone; title: string; body: string; openSettings?: boolean };

const MONO_CAPTION = {
  fontFamily: fonts.mono.regular,
  fontSize: 9.5,
  letterSpacing: 1.3,
} as const;

export function PushNotifications({ serverPushEnabled }: Props) {
  const t = useTokens();
  const { state } = useAuth();
  const qc = useQueryClient();
  const { gate, disabledProps } = useOnlineGate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PushError | null>(null);
  const [recentNotifs, setRecentNotifs] = useState<NotificationHistoryEntry[]>([]);

  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const accessToken = state.status === 'authenticated' ? state.creds.token : '';

  const handshakeQuery = useQuery({
    queryKey: ['handshake', serverUrl],
    queryFn: () => handshake(serverUrl),
    enabled: serverPushEnabled === undefined && serverUrl.length > 0,
  });

  const pushEnabledOnServer =
    serverPushEnabled !== undefined
      ? serverPushEnabled
      : (handshakeQuery.data?.push_enabled ?? false);

  const push = usePushState();

  // Load notification history when push is opted-in
  useEffect(() => {
    if (!push.data?.userOptedIn) return;
    loadNotificationHistory()
      .then((entries) => setRecentNotifs(entries.slice(0, 3)))
      .catch(() => { /* best-effort */ });
  }, [push.data?.userOptedIn]);

  async function onEnable() {
    setPending(true);
    setError(null);
    const svc = new PushService({ serverUrl, accessToken });
    const res = await svc.enable();
    setPending(false);
    if (res.kind === 'ok') {
      await qc.invalidateQueries({ queryKey: [...PUSH_STATE_QUERY_KEY] });
    } else if (res.kind === 'permission_denied') {
      setError({
        tone: 'warn',
        title: 'Permission denied',
        body: 'You declined notifications for bookkeeprr. Enable them in your device Settings → bookkeeprr → Notifications, then retry.',
        openSettings: true,
      });
    } else if (res.kind === 'server_error') {
      setError({
        tone: 'err',
        title: `Registration failed${res.status ? ` (${res.status})` : ''}`,
        body: 'The server accepted permission but could not register the device token. Try again, and check the server logs for /api/mobile/push/register.',
      });
    } else {
      setError({ tone: 'err', title: 'Token error', body: res.reason });
    }
  }

  async function onDisable() {
    setPending(true);
    setError(null);
    const svc = new PushService({ serverUrl, accessToken });
    await svc.disable();
    setPending(false);
    await qc.invalidateQueries({ queryKey: [...PUSH_STATE_QUERY_KEY] });
  }

  const card = {
    padding: 16,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 12,
  } as const;

  function BellTile({ variant }: { variant: 'primary' | 'muted' | 'warn' }) {
    const map = {
      primary: { bg: withAlpha(t.primary, 0.16), fg: t.primary, line: withAlpha(t.primary, 0.35) },
      muted: { bg: t.surfaceMuted, fg: t.textMuted, line: t.border },
      warn: { bg: t.warnBg, fg: t.warnFg, line: t.warnLine },
    }[variant];
    const Glyph = variant === 'warn' ? AlertTriangle : Bell;
    return (
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: map.bg,
          borderWidth: 1,
          borderColor: map.line,
        }}
      >
        <Glyph size={18} color={map.fg} strokeWidth={2} />
      </View>
    );
  }

  function renderBody() {
    if (!pushEnabledOnServer) {
      return (
        <View testID="push-disabled-server" style={[card, { gap: 10 }]}>
          <BellTile variant="muted" />
          <Text style={[text.body, { color: t.text }]}>
            Push Notifications can&apos;t be enabled because cloud services are turned off on this
            server.
          </Text>
          <Text style={[text.bodySm, { color: t.textMuted }]}>
            Ask the server administrator to enable cloud services and accept the EULA + Privacy
            Policy first.
          </Text>
          <View
            style={{ marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.border, gap: 6 }}
          >
            <Text style={[MONO_CAPTION, { color: t.textMuted }]}>HANDSHAKE</Text>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, color: t.text }}>
              push_enabled: <Text style={{ color: t.errFg }}>false</Text>
            </Text>
          </View>
        </View>
      );
    }

    if (push.data?.userOptedIn) {
      const token = push.data?.registeredToken ?? '';
      return (
        <>
          <View
            testID="push-state-on"
            style={[card, { borderColor: withAlpha(t.primary, 0.35), gap: 12 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <BellTile variant="primary" />
              <Text style={[text.label, { color: t.text, flex: 1 }]}>Enabled on this device</Text>
              <StatusDot kind="ok" />
            </View>
            <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border, gap: 6 }}>
              <Text style={[MONO_CAPTION, { color: t.textMuted }]}>FCM TOKEN</Text>
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 11, color: t.textMuted }}>
                {token ? `${token.slice(0, 24)}…` : '—'}
              </Text>
            </View>
            <Button
              testID="btn-push-disable"
              label={pending ? 'Disabling…' : 'Disable'}
              variant="secondary"
              onPress={gate(onDisable)}
              disabled={pending || disabledProps.disabled}
            />
          </View>
          {recentNotifs.length > 0 ? (
            <View
              testID="recent-notifications-list"
              style={{
                padding: 14,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.border,
                borderRadius: 12,
                gap: 8,
              }}
            >
              <Text style={[MONO_CAPTION, { color: t.textMuted }]}>RECENT NOTIFICATIONS</Text>
              {recentNotifs.map((n, idx) => (
                <View
                  key={idx}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
                >
                  <View style={{ marginTop: 4 }}>
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor: t.primary,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ fontFamily: fonts.sans.medium, fontSize: 12.5, color: t.text }}
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                    <Text
                      style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, color: t.textMuted, marginTop: 1 }}
                    >
                      {fmtRelative(n.receivedAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      );
    }

    return (
      <>
        <View testID="push-state-off" style={[card, { gap: 12 }]}>
          <BellTile variant="primary" />
          <Text style={[text.label, { color: t.text }]}>
            Receive push notifications when your library updates.
          </Text>
          <Text style={[text.bodySm, { color: t.textMuted }]}>
            Tapping Enable will prompt your device to allow notifications. We&apos;ll register this
            device&apos;s token with the server.
          </Text>
          <Button
            testID="btn-push-enable"
            label={pending ? 'Enabling…' : 'Enable'}
            onPress={gate(onEnable)}
            disabled={pending || disabledProps.disabled}
          />
        </View>

        <View
          style={{
            padding: 14,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 10,
            gap: 6,
          }}
        >
          <Text style={[MONO_CAPTION, { color: t.textMuted }]}>WHAT WE SEND</Text>
          <Text
            style={{ fontFamily: fonts.mono.regular, fontSize: 11, color: t.textMuted, lineHeight: 18 }}
          >
            POST /api/mobile/push/register{'\n'}
            {'{ device_token: <fcm/apns>, platform: ios|android }'}
          </Text>
        </View>

        <InlineAlert
          tone="info"
          title="Heads-up"
          body="Notifications use Firebase Cloud Messaging (FCM) on Android and Apple Push Notification service (APNs) on iOS, fanned out via the bookkeeprr cloud microservice."
        />
      </>
    );
  }

  return (
    <ScreenContainer testID="screen-push-notifications">
      <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
        <Text
          style={{
            fontFamily: fonts.display.semibold,
            fontSize: 26,
            letterSpacing: -0.7,
            color: t.text,
          }}
        >
          Push Notifications
        </Text>
        {renderBody()}
        {error !== null ? (
          <View style={{ gap: 10 }}>
            <InlineAlert
              testID="push-error"
              tone={error.tone}
              title={error.title}
              body={error.body}
            />
            {error.openSettings ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  label="Open settings"
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                />
                <Button label="Retry" variant="ghost" onPress={gate(onEnable)} disabled={pending || disabledProps.disabled} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

export default PushNotifications;
