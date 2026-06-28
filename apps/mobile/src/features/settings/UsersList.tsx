import { View, Text, Pressable } from 'react-native';
import { MoreVertical } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/auth/AuthContext';
import { resolveAssetUri } from '@/api/asset';
import type { UserRow as UserRowData } from '@/api/schemas';

interface Props {
  users: UserRowData[];
  /** When provided, each row gets a trailing actions affordance. */
  onAction?: (user: UserRowData) => void;
  /** When provided, tapping a row body opens that member's profile. */
  onOpenProfile?: (user: UserRowData) => void;
}

export function UsersList({ users, onAction, onOpenProfile }: Props) {
  const t = useTokens();
  const { state } = useAuth();
  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  return (
    <View>
      {users.map((u) => {
        // Prefer the display name when the admin set one; the username is the
        // stable fallback. The avatar resolves a custom upload first, then
        // Gravatar (keyed off email), then initials.
        const name = u.displayName?.trim() || u.username;
        return (
        <Pressable
          key={u.id}
          testID={`user-row-${u.id}`}
          disabled={onOpenProfile === undefined}
          onPress={() => onOpenProfile?.(u)}
          accessibilityLabel={onOpenProfile ? `View ${name}'s profile` : undefined}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
            opacity: u.disabled ? 0.55 : 1,
          }}
        >
          <Avatar
            testID={`user-avatar-${u.id}`}
            size={34}
            name={name}
            email={u.email ?? ''}
            avatarUrl={resolveAssetUri(serverUrl, u.avatarUrl)}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={1} style={[text.label, { color: t.text }]}>{name}</Text>
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  backgroundColor: u.role === 'admin' ? t.primary : t.surfaceMuted,
                }}
              >
                <Text style={[text.monoSm, { color: u.role === 'admin' ? t.primaryFg : t.text }]}>
                  {u.role.toUpperCase()}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  backgroundColor: t.surfaceMuted,
                }}
              >
                <Text style={[text.monoSm, { color: t.textMuted }]}>{u.source.toUpperCase()}</Text>
              </View>
            </View>
            {u.displayName?.trim() && u.displayName.trim() !== u.username ? (
              <Text numberOfLines={1} style={[text.monoSm, { color: t.textMuted, marginTop: 4 }]}>
                @{u.username}
              </Text>
            ) : null}
            {u.email ? (
              <Text numberOfLines={1} style={[text.monoSm, { color: t.textMuted, marginTop: 4 }]}>
                {u.email}
              </Text>
            ) : null}
          </View>
          <Text style={[text.monoSm, { color: u.disabled ? t.warn : t.textMuted }]}>
            {u.disabled ? 'DISABLED' : 'ACTIVE'}
          </Text>
          {onAction ? (
            <Pressable
              testID={`user-actions-${u.id}`}
              onPress={() => onAction(u)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Actions for ${name}`}
            >
              <MoreVertical size={20} color={t.textMuted} strokeWidth={1.75} />
            </Pressable>
          ) : null}
        </Pressable>
        );
      })}
    </View>
  );
}
