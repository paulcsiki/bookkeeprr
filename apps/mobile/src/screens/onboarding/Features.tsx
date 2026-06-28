import { View, Text, ScrollView } from 'react-native';
import { BookOpen, Download, Bell, Library } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import type { OnboardingStackParamList } from '@/navigation/types';

const FEATURES = [
  {
    icon: Library,
    title: 'Library',
    body: 'Browse and search your manga, comics, light novels, ebooks, and audiobooks.',
  },
  {
    icon: BookOpen,
    title: 'Add series',
    body: 'Search AniList, ComicVine, OpenLibrary, Audnex from one screen.',
  },
  {
    icon: Download,
    title: 'Auto-grab',
    body: 'Monitor releases via Nyaa and FileList; matched releases flow to your qBittorrent.',
  },
  {
    icon: Bell,
    title: 'Activity & notifications',
    body: 'See live download progress; Discord and Apprise notifications.',
  },
];

export default function Features() {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const t = useTokens();
  return (
    <ScreenContainer testID="screen-features" edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ paddingTop: 16, paddingBottom: 8 }}>
        <Text style={[text.displayMd, { color: t.text }]}>What you can do</Text>
      </View>
      <ScrollView contentContainerStyle={{ gap: 14, paddingVertical: 12 }}>
        {FEATURES.map((f) => (
          <View
            key={f.title}
            style={{
              flexDirection: 'row',
              gap: 12,
              padding: 14,
              borderRadius: 12,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.surfaceMuted,
              }}
            >
              <f.icon size={18} color={t.text} strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[text.label, { color: t.text }]}>{f.title}</Text>
              <Text style={[text.bodySm, { color: t.textMuted }]}>{f.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingBottom: 24, gap: 10 }}>
        <Button
          testID="btn-continue"
          label="Continue"
          onPress={() => navigation.navigate('ServerUrl')}
        />
      </View>
    </ScreenContainer>
  );
}
