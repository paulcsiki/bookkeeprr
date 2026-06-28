// Settings → Per-user notification preferences screen.
//
// Shows 4 event toggles and a channel segmented control.
// Reads from / patches to GET/PATCH /api/auth/me/notifications.

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Toggle } from '@/components/Toggle';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

const TRANSPARENT = 'transparent';

type Channel = 'email' | 'push' | 'webhook';

interface Prefs {
  eventGrabSuccess: boolean;
  eventImportSuccess: boolean;
  eventFailure: boolean;
  eventUpdateAvailable: boolean;
  channel: Channel;
}

const EVENT_ROWS: Array<{ key: keyof Omit<Prefs, 'channel'>; label: string; sub: string }> = [
  { key: 'eventGrabSuccess', label: 'Grab completed', sub: 'Torrent finished downloading' },
  { key: 'eventImportSuccess', label: 'Import completed', sub: 'File successfully imported' },
  { key: 'eventFailure', label: 'Grab failed', sub: 'Grab or import encountered an error' },
  { key: 'eventUpdateAvailable', label: 'Weekly digest', sub: 'Periodic update on new volumes' },
];

const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
  { value: 'webhook', label: 'Webhook' },
];

export function MobNotifications() {
  const t = useTokens();
  const navigation = useNavigation();
  const { state, signOut } = useAuth();

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const online = useIsOnline();
  const { gate, online: gateOnline } = useOnlineGate();

  const client =
    state.status === 'authenticated'
      ? createApiClient(state.creds, { onAuthFail: () => signOut() })
      : null;

  useEffect(() => {
    if (!client) return;
    client
      .get<{ prefs: Prefs }>('/api/auth/me/notifications')
      .then((j) => setPrefs(j.prefs))
      .catch(() => Alert.alert('Error', 'Could not load notification preferences'))
      .finally(() => setLoading(false));
  }, []);

  async function patch(update: Partial<Prefs>): Promise<void> {
    if (state.status !== 'authenticated' || !prefs) return;
    const optimistic = { ...prefs, ...update };
    setPrefs(optimistic);
    try {
      const creds = state.creds;
      const url = `${creds.serverUrl.replace(/\/$/, '')}/api/auth/me/notifications`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.token}`,
        },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
      const j = (await res.json()) as { prefs: Prefs };
      setPrefs(j.prefs);
    } catch {
      setPrefs(prefs);
      Alert.alert('Error', 'Could not update preference');
    }
  }

  const card = {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 12,
    overflow: 'hidden' as const,
  };

  return (
    <ScreenContainer testID="screen-mob-notifications">
      <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
        {/* Header */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} testID="btn-back-notifications">
            <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
          </Pressable>
          <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Notifications</Text>
        </View>

        {!online && prefs === null ? (
          <SettingsOfflineState />
        ) : loading ? (
          <Text style={[text.bodySm, { color: t.textMuted }]}>Loading…</Text>
        ) : !prefs ? null : (
          <>
            {/* Event toggles */}
            <View style={[card, { opacity: gateOnline ? 1 : 0.5 }]}>
              {EVENT_ROWS.map(({ key, label, sub }, idx) => (
                <View
                  key={key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderBottomWidth: idx < EVENT_ROWS.length - 1 ? 1 : 0,
                    borderBottomColor: t.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[text.label, { color: t.text }]}>{label}</Text>
                    <Text style={[text.monoSm, { color: t.textMuted, marginTop: 2 }]}>{sub}</Text>
                  </View>
                  <Toggle
                    on={prefs[key]}
                    onChange={gate((next: boolean) => void patch({ [key]: next }))}
                    testID={`toggle-${key}`}
                  />
                </View>
              ))}
            </View>

            {/* Channel segmented control */}
            <View>
              <Text
                style={{
                  fontFamily: fonts.mono.regular,
                  fontSize: 9.5,
                  letterSpacing: 1.3,
                  color: t.textMuted,
                  marginBottom: 8,
                }}
              >
                DELIVERY CHANNEL
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: t.surface,
                  borderWidth: 1,
                  borderColor: t.border,
                  borderRadius: 10,
                  padding: 3,
                  gap: 3,
                  opacity: gateOnline ? 1 : 0.5,
                }}
              >
                {CHANNELS.map(({ value, label }) => {
                  const active = prefs.channel === value;
                  return (
                    <Pressable
                      key={value}
                      testID={`channel-${value}`}
                      onPress={gate(() => void patch({ channel: value }))}
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        borderRadius: 8,
                        alignItems: 'center',
                        backgroundColor: active ? t.primary : TRANSPARENT,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.sans.medium,
                          fontSize: 12.5,
                          color: active ? t.primaryFg : t.textMuted,
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

export default MobNotifications;
