// Settings → Active sessions screen.
//
// Lists sessions returned by GET /api/auth/sessions.
// The current session is marked with a "current" badge and cannot be revoked.
// Other sessions can be revoked via DELETE /api/auth/sessions/:id.

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Monitor, Trash2 } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

interface SessionEntry {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

export function MobSessions() {
  const t = useTokens();
  const navigation = useNavigation();
  const { state, signOut } = useAuth();

  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const online = useIsOnline();
  const { gate } = useOnlineGate();

  const client =
    state.status === 'authenticated'
      ? createApiClient(state.creds, { onAuthFail: () => signOut() })
      : null;

  const loadSessions = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const j = await client.get<{ sessions: SessionEntry[] }>('/api/auth/sessions');
      setSessions(j.sessions);
      setLoaded(true);
    } catch {
      Alert.alert('Error', 'Could not load sessions');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void loadSessions();
    }, [loadSessions]),
  );

  async function revokeSession(id: string): Promise<void> {
    Alert.alert(
      'Revoke session',
      'Are you sure you want to revoke this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            if (!client) return;
            setRevoking(id);
            try {
              await client.delete(`/api/auth/sessions/${id}`);
              setSessions((prev) => prev.filter((s) => s.id !== id));
            } catch {
              Alert.alert('Error', 'Could not revoke session');
            } finally {
              setRevoking(null);
            }
          },
        },
      ],
    );
  }

  const card = {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 12,
    overflow: 'hidden' as const,
  };

  return (
    <ScreenContainer testID="screen-mob-sessions">
      <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
        {/* Header */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} testID="btn-back-sessions">
            <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
          </Pressable>
          <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Sessions</Text>
          {sessions.length > 0 ? (
            <Text style={[text.monoSm, { color: t.textMuted }]}>{sessions.length}</Text>
          ) : null}
        </View>

        {!online && !loaded ? (
          <SettingsOfflineState />
        ) : loading ? (
          <View style={{ paddingTop: 32, alignItems: 'center' }}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : sessions.length === 0 ? (
          <Text style={[text.bodySm, { color: t.textMuted }]}>No active sessions found.</Text>
        ) : (
          <View style={card}>
            {sessions.map((s, idx) => (
              <View
                key={s.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderBottomWidth: idx < sessions.length - 1 ? 1 : 0,
                  borderBottomColor: t.border,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: t.surfaceMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Monitor size={14} color={t.text} strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      style={{ fontFamily: fonts.mono.regular, fontSize: 12, color: t.text }}
                    >
                      {s.id}
                    </Text>
                    {s.current ? (
                      <View
                        style={{
                          borderRadius: 99,
                          borderWidth: 1,
                          borderColor: withAlpha(t.primary, 0.4),
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: fonts.mono.regular,
                            fontSize: 9,
                            color: t.primary,
                          }}
                        >
                          current
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: fonts.mono.regular,
                      fontSize: 10.5,
                      color: t.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {s.userAgent ?? 'Unknown device'}
                  </Text>
                  <Text
                    style={{
                      fontFamily: fonts.mono.regular,
                      fontSize: 10,
                      color: t.textMuted,
                      marginTop: 1,
                    }}
                  >
                    {s.ipAddress ? `${s.ipAddress} · ` : ''}Last seen {fmtDate(s.lastSeenAt)}
                  </Text>
                </View>
                {!s.current ? (
                  <Pressable
                    testID={`btn-revoke-${s.id}`}
                    onPress={gate(() => void revokeSession(s.id))}
                    disabled={revoking === s.id}
                    hitSlop={8}
                    style={{ padding: 4, opacity: online ? 1 : 0.5 }}
                  >
                    {revoking === s.id ? (
                      <ActivityIndicator size="small" color={t.err} />
                    ) : (
                      <Trash2 size={15} color={t.err} strokeWidth={1.75} />
                    )}
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

export default MobSessions;
