import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useUsers, useMe } from '@/api/hooks';
import { UsersList } from '@/features/settings/UsersList';
import { UserActionsSheet } from '@/features/settings/users/UserActionsSheet';
import type { UserRow } from '@/api/schemas';
import type { SettingsStackParamList } from '@/navigation/types';
import { useIsOnline } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

/** Inner component rendered only when the current user is confirmed admin.
 *  Keeps the `useUsers()` call in an admin-only subtree so non-admins never
 *  trigger GET /api/users → 403. */
function UsersAdminView() {
  const t = useTokens();
  const nav = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const q = useUsers();
  const online = useIsOnline();
  const [selected, setSelected] = useState<UserRow | null>(null);

  if (!online && q.data === undefined) return <SettingsOfflineState />;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 4, paddingBottom: 12 }}>
          <Button
            testID="btn-add-user"
            label="Add user"
            onPress={() => nav.navigate('CreateUser')}
          />
        </View>
        {q.isLoading ? (
          <Text
            testID="users-loading"
            style={[text.bodySm, { color: t.textMuted, padding: 24, textAlign: 'center' }]}
          >
            Loading…
          </Text>
        ) : q.isError ? (
          <Text
            testID="users-error"
            style={[text.bodySm, { color: t.err, padding: 24, textAlign: 'center' }]}
          >
            Couldn&apos;t load users.
          </Text>
        ) : (
          <UsersList
            users={q.data?.users ?? []}
            onAction={(u: UserRow) => setSelected(u)}
            onOpenProfile={(u: UserRow) => nav.navigate('UserProfile', { userId: u.id })}
          />
        )}
      </ScrollView>
      {selected ? (
        <UserActionsSheet user={selected} onDone={() => setSelected(null)} />
      ) : null}
    </>
  );
}

export default function Users() {
  const t = useTokens();
  const navigation = useNavigation();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return (
    <ScreenContainer testID="screen-users">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <Pressable testID="btn-back-users" onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Users</Text>
      </View>
      {me.data !== undefined && !isAdmin ? (
        <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
          <InlineAlert
            tone="info"
            body="User management requires an administrator account."
            testID="users-readonly-note"
          />
        </View>
      ) : isAdmin ? (
        <UsersAdminView />
      ) : null}
    </ScreenContainer>
  );
}
