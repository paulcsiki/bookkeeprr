import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SettingsSection } from '@/components/SettingsSection';
import { ThemeSwitcher } from '@/features/settings/ThemeSwitcher';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

export default function Appearance() {
  const t = useTokens();
  const navigation = useNavigation();
  return (
    <ScreenContainer testID="screen-appearance">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-appearance" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Appearance</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SettingsSection
          label="THEME"
          description="Seven accent themes in light or dark. Applies across the app instantly."
        >
          <View style={{ padding: 16 }}>
            <ThemeSwitcher />
          </View>
        </SettingsSection>
      </ScrollView>
    </ScreenContainer>
  );
}
