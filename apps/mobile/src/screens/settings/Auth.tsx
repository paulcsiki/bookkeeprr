import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Chip } from '@/components/Chip';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useMe } from '@/api/hooks';
import { OidcForm } from '@/features/settings/auth/OidcForm';
import { ForwardAuthForm } from '@/features/settings/auth/ForwardAuthForm';

type Method = 'oidc' | 'forward';

export default function AuthScreen() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const [method, setMethod] = useState<Method>('oidc');

  return (
    <ScreenContainer testID="screen-auth">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-auth" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Authentication</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Authentication is configured by an administrator."
            testID="auth-readonly-note"
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip
              testID="auth-tab-oidc"
              active={method === 'oidc'}
              onPress={() => setMethod('oidc')}
            >
              OIDC / SSO
            </Chip>
            <Chip
              testID="auth-tab-forward"
              active={method === 'forward'}
              onPress={() => setMethod('forward')}
            >
              Forward auth
            </Chip>
          </View>
          <Text style={[text.bodySm, { color: t.textMuted }]}>
            Local username + password is always available.
          </Text>
          {method === 'oidc' ? <OidcForm /> : <ForwardAuthForm />}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
