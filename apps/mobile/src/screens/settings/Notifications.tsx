import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useMe } from '@/api/hooks';
import { NotificationsForm } from '@/features/settings/notifications/NotificationsForm';

export default function Notifications() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-notifications">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-notifications" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Notifications</Text>
      </View>

      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="Notification settings require an administrator account."
            testID="notifications-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 4, paddingTop: 8 }}
        >
          <NotificationsForm />
        </ScrollView>
      ) : null}
    </ScreenContainer>
  );
}
