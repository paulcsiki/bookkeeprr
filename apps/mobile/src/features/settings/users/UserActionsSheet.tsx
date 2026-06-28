import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  KeyRound,
  ShieldCheck,
  ShieldOff,
  UserX,
  UserCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { InlineAlert } from '@/components/InlineAlert';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';
import { useUpdateUser, useDeleteUser } from '@/api/hooks';
import { ApiError } from '@/api/client';
import type { UserRow } from '@/api/schemas';
import { ResetPasswordSheet } from './ResetPasswordSheet';
import { useOnlineGate } from '@/features/system/online';

function ActionRow({
  icon: Icon,
  label,
  onPress,
  tone,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  testID?: string;
}) {
  const t = useTokens();
  const color = tone === 'danger' ? t.errFg : t.text;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}
    >
      <Icon size={20} color={color} strokeWidth={1.75} />
      <Text style={[text.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Per-user action sheet: reset password, toggle role, enable/disable, delete.
 * Server 409s (last-admin, self-disable, self-delete) carry `{message}`, which
 * we surface inline. Delete requires a confirming second tap.
 */
export function UserActionsSheet({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const t = useTokens();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const { gate, online } = useOnlineGate();
  const [err, setErr] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function messageFor(e: unknown, fallback: string): string {
    return e instanceof ApiError
      ? ((e.body as { message?: string })?.message ?? fallback)
      : fallback;
  }

  async function toggleRole() {
    setErr(null);
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await update.mutateAsync({ id: user.id, role: nextRole });
      onDone();
    } catch (e) {
      setErr(messageFor(e, 'Could not change role'));
    }
  }

  async function toggleDisabled() {
    setErr(null);
    try {
      await update.mutateAsync({ id: user.id, disabled: !user.disabled });
      onDone();
    } catch (e) {
      setErr(messageFor(e, 'Could not update user'));
    }
  }

  async function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setErr(null);
    try {
      await remove.mutateAsync(user.id);
      onDone();
    } catch (e) {
      setConfirmDelete(false);
      setErr(messageFor(e, 'Could not delete user'));
    }
  }

  if (showReset) {
    return <ResetPasswordSheet user={user} onDone={onDone} />;
  }

  const busy = update.isPending || remove.isPending;

  return (
    <BottomSheet testID={`user-actions-sheet-${user.id}`} onDismiss={onDone}>
      <View style={{ gap: 2 }}>
        <Text style={[text.displaySm, { color: t.text }]}>{user.displayName?.trim() || user.username}</Text>
        <Text style={[text.bodySm, { color: t.textMuted, marginBottom: 8 }]}>@{user.username}</Text>
        {err ? <InlineAlert tone="err" body={err} testID="user-actions-error" /> : null}
        <ActionRow
          icon={KeyRound}
          label="Reset password"
          testID="ua-reset"
          onPress={() => setShowReset(true)}
        />
        <View style={{ opacity: online ? 1 : 0.5 }}>
          <ActionRow
            icon={user.role === 'admin' ? ShieldOff : ShieldCheck}
            label={user.role === 'admin' ? 'Make standard user' : 'Make admin'}
            testID="ua-role"
            onPress={gate(() => {
              if (!busy) void toggleRole();
            })}
          />
          <ActionRow
            icon={user.disabled ? UserCheck : UserX}
            label={user.disabled ? 'Enable' : 'Disable'}
            testID="ua-disabled"
            onPress={gate(() => {
              if (!busy) void toggleDisabled();
            })}
          />
          <ActionRow
            icon={Trash2}
            label={confirmDelete ? 'Tap again to confirm delete' : 'Delete user'}
            tone="danger"
            testID="ua-delete"
            onPress={gate(() => {
              if (!busy) void onDelete();
            })}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
