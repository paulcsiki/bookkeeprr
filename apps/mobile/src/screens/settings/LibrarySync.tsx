import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useMe, useAudiobookshelf, useCalibre } from '@/api/hooks';
import { AudiobookshelfCard } from '@/features/settings/sync/AudiobookshelfCard';
import { CalibreCard } from '@/features/settings/sync/CalibreCard';
import { useIsOnline } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

export default function LibrarySync() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const online = useIsOnline();
  // Both cards own their own queries; show ONE offline placeholder for the screen
  // when neither has cached data yet, rather than two stacked card-level states.
  const abs = useAudiobookshelf();
  const cal = useCalibre();
  const noCache = abs.data === undefined && cal.data === undefined;

  return (
    <ScreenContainer testID="screen-library-sync">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable
          testID="btn-back-library-sync"
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Library Sync</Text>
      </View>

      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Library sync settings require an administrator account."
            testID="library-sync-readonly-note"
          />
        </View>
      ) : isAdmin && !online && noCache ? (
        <SettingsOfflineState />
      ) : isAdmin ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4, gap: 20, paddingTop: 8 }}
        >
          <AudiobookshelfCard />
          <CalibreCard />
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}
