import { useState } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useOnboarding } from '@/state/onboardingStore';

// Placeholder fingerprint — real fetch happens at exchange time once the
// platform-native cert API is wired up. For M1 we accept the user's manual confirmation.
const STUB_FINGERPRINT = 'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99';

export default function TrustCert() {
  const navigation = useNavigation();
  const t = useTokens();
  const { setCertFingerprint, serverUrl } = useOnboarding();
  const [accepted, setAccepted] = useState(false);

  const onAccept = () => {
    setCertFingerprint(STUB_FINGERPRINT);
    setAccepted(true);
    navigation.goBack();
  };

  return (
    <ScreenContainer testID="screen-trust-cert" edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ paddingTop: 16, paddingBottom: 8 }}>
        <Text style={[text.displayMd, { color: t.text }]}>Trust this certificate?</Text>
        <Text style={[text.bodySm, { color: t.textMuted, marginTop: 4 }]}>
          {serverUrl || 'server'} presents a self-signed certificate. Verify the fingerprint matches
          what your server admin published.
        </Text>
      </View>
      <View
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.surface,
          gap: 10,
        }}
      >
        <Text style={[text.label, { color: t.textMuted }]}>SHA-256 FINGERPRINT</Text>
        <Text testID="cert-fingerprint" style={[text.mono, { color: t.text }]}>
          {STUB_FINGERPRINT}
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingBottom: 24, gap: 10 }}>
        <Button
          testID="btn-trust"
          label={accepted ? 'Trusted' : 'Trust'}
          onPress={onAccept}
          disabled={accepted}
        />
        <Button
          testID="btn-cancel"
          label="Cancel"
          variant="ghost"
          onPress={() => navigation.goBack()}
        />
      </View>
    </ScreenContainer>
  );
}
