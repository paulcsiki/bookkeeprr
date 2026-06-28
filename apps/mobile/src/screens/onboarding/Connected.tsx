import { useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Check } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/auth/AuthContext';
import { useMe } from '@/api/hooks';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import type { RootStackParamList } from '@/navigation/types';

export default function Connected() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const t = useTokens();
  const { state } = useAuth();
  const me = useMe();

  const goToLibrary = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'App',
          state: { routes: [{ name: 'Library', state: { routes: [{ name: 'LibraryHome' }] } }] },
        },
      ],
    });
  }, [navigation]);

  useEffect(() => {
    // Disable auto-progress under e2e — Maestro explicitly taps
    // btn-go-library, and the 2.2s setTimeout firing during/after the
    // explicit tap races React Navigation's state mutation. On Android
    // this surfaced as the test landing on the AddSeries modal instead
    // of LibraryHome (Maestro jobs 1236/1249/1250 all captured this).
    if (process.env.EXPO_PUBLIC_MOBILE_E2E === '1') return;
    const timer = setTimeout(goToLibrary, 2200);
    return () => clearTimeout(timer);
  }, [goToLibrary]);

  const serverHost =
    state.status === 'authenticated'
      ? state.creds.serverUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : '—';
  // Show the real signed-in identity (display name → username), falling back
  // only until /me resolves.
  const username = me.data?.displayName?.trim() || me.data?.username || 'You';
  const email = me.data?.email ?? `${serverHost}@local`;

  return (
    <ScreenContainer testID="screen-connected" edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 20 }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(t.primary, 0.16),
            borderWidth: 1,
            borderColor: withAlpha(t.primary, 0.35),
          }}
        >
          <Check size={28} color={t.primary} strokeWidth={2.2} />
        </View>
        <Text style={[text.displayMd, { color: t.text }]}>Connected.</Text>
        <Text style={[text.bodySm, { color: t.textMuted }]}>Setting up your reading room…</Text>

        <View
          style={{
            width: '100%',
            marginTop: 14,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 14,
            backgroundColor: t.surface,
          }}
        >
          <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: t.textMuted, marginBottom: 4 }}>
              Server
            </Text>
            <Text style={{ fontFamily: fonts.mono.regular, fontSize: 13, color: t.text }}>{serverHost}</Text>
          </View>
          <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar email={email} name={username} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: fonts.sans.medium, fontSize: 13.5, color: t.text }}>{username}</Text>
              <Text style={{ fontFamily: fonts.mono.regular, fontSize: 10.5, color: t.textMuted, marginTop: 2 }}>{email}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={{ paddingBottom: 24 }}>
        <Button testID="btn-go-library" label="Open library" onPress={goToLibrary} />
      </View>
    </ScreenContainer>
  );
}
