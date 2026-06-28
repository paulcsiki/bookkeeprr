import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { CoverBand } from '@/components/CoverBand';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import type { OnboardingStackParamList } from '@/navigation/types';

export default function Welcome() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const t = useTokens();
  return (
    <ScreenContainer testID="screen-welcome" edges={['top', 'bottom', 'left', 'right']}>
      <CoverBand />
      <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
        <Text
          style={{
            fontFamily: fonts.mono.regular,
            fontSize: 10.5,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: t.textMuted,
            marginBottom: 4,
          }}
        >
          Self-hosted · Non-video media
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontFamily: fonts.display.semibold, fontSize: 48, color: t.text, letterSpacing: -1.2 }}>
            bookkeep
          </Text>
          <Text style={{ fontFamily: fonts.display.semibold, fontSize: 48, color: t.primary, letterSpacing: -1.2 }}>
            rr
          </Text>
        </View>
        <Text style={[text.body, { color: t.textMuted, marginTop: 8 }]}>
          The library for your manga, comics, books, and audiobooks. Connect to your self-hosted server.
        </Text>
      </View>
      <View style={{ paddingBottom: 24, gap: 10 }}>
        <Button
          testID="btn-get-started"
          label="Connect to a server"
          onPress={() => navigation.navigate('Features')}
        />
      </View>
    </ScreenContainer>
  );
}
