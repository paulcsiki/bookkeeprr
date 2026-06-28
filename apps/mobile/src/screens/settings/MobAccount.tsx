import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette, LogOut, Bell, MonitorSmartphone, ShieldCheck } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Avatar } from '@/components/Avatar';
import { SettingsSection } from '@/components/SettingsSection';
import { SettingsRow } from '@/components/SettingsRow';
import { SignOutSheet } from '@/components/SignOutSheet';
import { useAuth } from '@/auth/AuthContext';
import { useMe } from '@/api/hooks';
import { useTokens } from '@/theme/ThemeProvider';
import { withAlpha } from '@/theme/color';
import { fonts, text } from '@/theme/typography';
import type { SettingsStackParamList } from '@/navigation/types';

// Derive a stable synthetic identity from the serverUrl — the app is
// single-user and the Credentials struct carries no username/email.
function deriveIdentity(serverUrl: string): { displayName: string; email: string } {
  try {
    const url = new URL(serverUrl);
    const host = url.hostname;
    // Use hostname as both the display name and the email local-part.
    return { displayName: host, email: `me@${host}` };
  } catch {
    return { displayName: 'You', email: 'me@bookkeeprr.local' };
  }
}

type Nav = NativeStackNavigationProp<SettingsStackParamList>;

export function MobAccount() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { state, signOut } = useAuth();
  const me = useMe();
  const [signOutOpen, setSignOutOpen] = useState(false);

  // Prefer the real identity from the server (bearer-resolved); fall back to the
  // synthetic URL-derived one until it loads (or if the request fails).
  const derived =
    state.status === 'authenticated'
      ? deriveIdentity(state.creds.serverUrl)
      : { displayName: 'You', email: 'me@bookkeeprr.local' };
  const displayName = me.data?.displayName?.trim() || me.data?.username || derived.displayName;
  const email = me.data?.email ?? derived.email;

  const serverUrl =
    state.status === 'authenticated' ? state.creds.serverUrl : null;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: t.bg }}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40 }}
      >
        {/* Profile hero */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingVertical: 12,
            marginBottom: 8,
          }}
        >
          <Avatar email={email} name={displayName} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ fontFamily: fonts.display.semibold, fontSize: 18, color: t.text }}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {serverUrl ? (
              <Text
                style={{ fontFamily: fonts.mono.regular, fontSize: 11, color: t.textMuted, marginTop: 2 }}
                numberOfLines={1}
              >
                {serverUrl}
              </Text>
            ) : null}
          </View>
        </View>

        <SettingsSection label="PREFERENCES">
          <SettingsRow
            icon={Palette}
            name="Appearance"
            sub="Mode + accent"
            onPress={() => navigation.navigate('Appearance')}
            testID="row-mob-appearance"
          />
          <SettingsRow
            icon={Bell}
            name="Notifications"
            sub="Event toggles + channel"
            onPress={() => navigation.navigate('MobNotifications')}
            testID="row-mob-notifications"
          />
          <SettingsRow
            icon={MonitorSmartphone}
            name="Sessions"
            sub="View + revoke active sessions"
            onPress={() => navigation.navigate('MobSessions')}
            testID="row-mob-sessions"
          />
          <SettingsRow
            icon={ShieldCheck}
            name="Two-Factor Authentication"
            sub="TOTP + recovery codes"
            onPress={() => navigation.navigate('MobTotp')}
            testID="row-mob-totp"
            last
          />
        </SettingsSection>

        <SettingsSection label="DANGER">
          <Pressable
            testID="row-mob-signout"
            onPress={() => setSignOutOpen(true)}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: withAlpha(t.err, 0.13),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LogOut size={15} color={t.err} strokeWidth={1.75} />
              </View>
              <Text style={[text.label, { color: t.err }]}>Sign Out</Text>
            </View>
          </Pressable>
        </SettingsSection>
      </ScrollView>

      <SignOutSheet
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={async () => {
          setSignOutOpen(false);
          await signOut();
        }}
      />
    </>
  );
}
