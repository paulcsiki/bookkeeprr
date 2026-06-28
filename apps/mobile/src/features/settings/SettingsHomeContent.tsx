import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, CloudOff } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SettingsSection } from '@/components/SettingsSection';
import { SettingsRow } from '@/components/SettingsRow';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { useTokens } from '@/theme/ThemeProvider';
import { text, fonts } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { useAuth } from '@/auth/AuthContext';
import { useMe } from '@/api/hooks';
import { useLayout } from '@/responsive/useLayout';
import { SplitView } from '@/responsive/SplitView';
import {
  visibleGroups,
  settingsItemOffline,
  type SettingsNavItem,
} from '@/features/settings/settings-nav';
import { useIsOnline } from '@/features/system/online';
import type { SettingsStackParamList } from '@/navigation/types';

// A small number of legacy testIDs are tied to specific rows in existing e2e
// suites and must be preserved verbatim even though the nav item `key` differs.
const ROW_TESTID_OVERRIDES: Record<string, string> = {
  push: 'row-push-notifications',
  notifications: 'row-integrations',
};
const rowTestID = (key: string) => ROW_TESTID_OVERRIDES[key] ?? `row-${key}`;

export function SettingsHomeContent() {
  const t = useTokens();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const { state, signOut } = useAuth();
  const me = useMe();
  const layout = useLayout();
  const online = useIsOnline();
  const isAdmin = me.data?.role === 'admin';
  const groups = visibleGroups(isAdmin);
  const [detail, setDetail] = useState<string>('appearance');

  const host =
    state.status === 'authenticated'
      ? state.creds.serverUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : 'local';
  const username = me.data?.displayName?.trim() || me.data?.username || 'You';
  const email = me.data?.email ?? `${host}@local`;
  const role = me.data?.role ?? 'user';

  function ProfileCard() {
    return (
      <Pressable
        onPress={() => navigation.navigate('MobAccount')}
        style={{
          marginHorizontal: 14,
          marginBottom: 20,
          padding: 16,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Avatar email={email} name={username} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[text.displaySm, { color: t.text }]}>{username}</Text>
          <Text style={[text.bodySm, { color: t.textMuted, marginTop: 2 }]}>{email}</Text>
        </View>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: withAlpha(t.primary, 0.16),
          }}
        >
          <Text
            style={{
              fontFamily: fonts.mono.regular,
              fontSize: 9.5,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: t.primary,
            }}
          >
            {role}
          </Text>
        </View>
        <ChevronRight size={16} color={t.textMuted} />
      </Pressable>
    );
  }

  function onRowPress(item: SettingsNavItem) {
    if (item.status !== 'native' || !item.route) return;
    // Cast required: `item.route` is `keyof SettingsStackParamList` (a wide
    // union), but `navigate()` overloads each require a single literal type.
    // The runtime value is always a valid screen name from settings-nav.tsx.
    navigation.navigate(item.route as never);
  }

  // ── Tablet master-detail ──────────────────────────────────────────────────
  if (layout.isLandscape) {
    const activeItem =
      groups.flatMap((g) => g.items).find((i) => i.key === detail) ??
      groups.flatMap((g) => g.items)[0];
    const Detail = activeItem?.Component;
    return (
      <View testID="screen-settings" style={{ flex: 1, backgroundColor: t.bg }}>
        <SplitView
          testID="settings-split"
          leftFlex={1}
          rightFlex={2.4}
          left={
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <Text
                style={{
                  fontFamily: fonts.display.semibold,
                  fontSize: 18,
                  letterSpacing: -0.4,
                  color: t.text,
                  paddingHorizontal: 18,
                  paddingTop: 16,
                  paddingBottom: 8,
                }}
              >
                Settings
              </Text>
              {groups.map((group) => (
                <View key={group.label}>
                  <Text
                    style={{
                      fontFamily: fonts.mono.regular,
                      fontSize: 10.5,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      color: t.textMuted,
                      paddingHorizontal: 18,
                      paddingTop: 16,
                      paddingBottom: 6,
                    }}
                  >
                    {group.label}
                  </Text>
                  {group.items.map((item) => {
                    const active = item.key === detail;
                    const gated = !online && settingsItemOffline(item) === 'server';
                    return (
                      <Pressable
                        key={item.key}
                        testID={`set-nav-${item.key}`}
                        onPress={() => setDetail(item.key)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingVertical: 9,
                          paddingHorizontal: 16,
                          borderLeftWidth: active ? 2 : 0,
                          borderLeftColor: t.primary,
                          backgroundColor: active ? t.surfaceMuted : t.bg,
                          opacity: gated ? 0.55 : 1,
                        }}
                      >
                        <item.Icon
                          size={17}
                          color={active ? t.primary : t.textMuted}
                          strokeWidth={1.75}
                        />
                        <Text
                          style={{
                            flex: 1,
                            fontFamily: fonts.sans.medium,
                            fontSize: 13.5,
                            color: active ? t.primary : t.textMuted,
                          }}
                        >
                          {item.label}
                        </Text>
                        {gated ? (
                          <View testID={`set-nav-offline-${item.key}`}>
                            <CloudOff size={13} color={t.textMuted} strokeWidth={1.8} />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <View style={{ marginHorizontal: 14, marginTop: 24 }}>
                <Button
                  testID="btn-signout"
                  label="Sign out"
                  variant="secondary"
                  onPress={signOut}
                />
              </View>
            </ScrollView>
          }
          right={Detail ? <Detail /> : <View />}
        />
      </View>
    );
  }

  // ── Phone / tablet-portrait ───────────────────────────────────────────────
  return (
    <ScreenContainer testID="screen-settings">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View>
          <View style={{ paddingTop: 16, paddingBottom: 16 }}>
            <Text style={[text.displayMd, { color: t.text }]}>Settings</Text>
          </View>

          <ProfileCard />

          {groups.map((group) => (
            <SettingsSection key={group.label} label={group.label.toUpperCase()}>
              {group.items.map((item, idx) => {
                const last = idx === group.items.length - 1;
                if (item.status === 'soon') {
                  return (
                    <SettingsRow
                      key={item.key}
                      icon={item.Icon}
                      name={item.label}
                      sub="Coming to mobile"
                      testID={rowTestID(item.key)}
                      last={last}
                    />
                  );
                }
                const gated = !online && settingsItemOffline(item) === 'server';
                const row = (
                  <SettingsRow
                    icon={item.Icon}
                    name={item.label}
                    {...(gated ? { sub: 'Needs connection' } : {})}
                    onPress={() => onRowPress(item)}
                    testID={rowTestID(item.key)}
                    last={last}
                  />
                );
                // Dim the gated row via a wrapping View; it stays navigable (the
                // press handler is on the inner SettingsRow's Pressable).
                return gated ? (
                  <View key={item.key} style={{ opacity: 0.55 }}>
                    {row}
                  </View>
                ) : (
                  <View key={item.key}>{row}</View>
                );
              })}
            </SettingsSection>
          ))}

          <View style={{ marginHorizontal: 14 }}>
            <Button testID="btn-signout" label="Sign out" variant="secondary" onPress={signOut} />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
