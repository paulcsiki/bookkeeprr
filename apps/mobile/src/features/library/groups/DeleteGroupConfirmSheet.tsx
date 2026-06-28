import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { InlineAlert } from '@/components/InlineAlert';
import { useGroupMutations } from '@/api/hooks';
import { groupErrorMessage } from './errors';
import { descendantGroupIds, type GroupNode } from './lib';

interface Props {
  group: GroupNode | null;
  groups: GroupNode[];
  visible: boolean;
  onClose: () => void;
  /** Fires after the server confirmed the delete, with the deleted group's parentId. */
  onDeleted: (parentId: number | null) => void;
}

/**
 * Typed-name delete confirmation. Deleting a group cascades to its subgroups
 * AND their series (library rows only — files on disk stay), so any non-empty
 * subtree requires retyping the group's exact name before the destructive
 * button arms. A truly empty leaf (no subgroups, no series) skips the gate.
 */
export function DeleteGroupConfirmSheet({ group, groups, visible, onClose, onDeleted }: Props) {
  const t = useTokens();
  const { deleteGroup } = useGroupMutations();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-sync transient state every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setTyped('');
    setError(null);
  }, [visible, group]);

  if (group === null) return null;

  // N = self + recursive subgroups; M = recursive series count (server fact).
  const n = descendantGroupIds(groups, group.id).size;
  const m = group.seriesCount;
  const needsTypedName = n > 1 || m > 0;
  const armed = !needsTypedName || typed === group.name;
  const disabled = !armed || deleteGroup.isPending;

  function onConfirm() {
    if (group === null) return;
    setError(null);
    deleteGroup.mutate(
      { id: group.id },
      {
        // No toast idiom in the app — the sheet closes and the row disappears
        // via invalidation. The parent uses parentId to pop the browse path
        // if it was inside the deleted subtree.
        onSuccess: () => {
          onDeleted(group.parentId);
          onClose();
        },
        onError: (e) =>
          setError(groupErrorMessage(e, "Couldn't delete the group — check the server.")),
      },
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* iOS keyboard padding for the typed-name input; Android resizes the
          window itself. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <BottomSheet testID="delete-group-sheet" onDismiss={onClose}>
          <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 14 }}>
            {/* Header per the ContinueReadingRail destructive-confirm idiom. */}
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.surfaceMuted,
                }}
              >
                <Trash2 size={20} color={t.err} strokeWidth={2} />
              </View>
              <Text style={[text.displaySm, { color: t.text, textAlign: 'center' }]}>
                Delete “{group.name}”?
              </Text>
              <Text style={[text.bodySm, { color: t.textMuted, textAlign: 'center' }]}>
                Deletes {n === 1 ? '1 group' : `${n} groups`} and {m} series from your library.
                Files on disk are untouched.
              </Text>
            </View>
            {needsTypedName ? (
              <View style={{ gap: 8 }}>
                <Text style={[text.bodySm, { color: t.textMuted }]}>
                  Type the group&apos;s name to confirm
                </Text>
                <TextInput
                  testID="delete-group-input"
                  value={typed}
                  onChangeText={(v) => {
                    setTyped(v);
                    setError(null);
                  }}
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="none"
                  maxLength={40}
                  placeholder={group.name}
                  placeholderTextColor={t.textMuted}
                  style={{
                    height: 44,
                    color: t.text,
                    backgroundColor: t.surfaceMuted,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: error !== null ? t.errFg : t.border,
                    fontFamily: fonts.sans.regular,
                    fontSize: 14,
                  }}
                />
              </View>
            ) : null}
            {error !== null ? (
              <InlineAlert tone="err" body={error} testID="delete-group-error" />
            ) : null}
            <View style={{ gap: 10 }}>
              {/* Destructive button: solid err background (the repo's
                  ContinueReadingRail confirm idiom — never translucent). */}
              <Pressable
                testID="delete-group-confirm"
                accessibilityRole="button"
                disabled={disabled}
                onPress={onConfirm}
                style={({ pressed }) => ({
                  height: 48,
                  borderRadius: 13,
                  backgroundColor: t.err,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
                })}
              >
                <Trash2 size={16} color={t.primaryFg} strokeWidth={2} />
                <Text style={[text.button, { color: t.primaryFg }]}>
                  {deleteGroup.isPending ? 'Deleting…' : 'Delete group'}
                </Text>
              </Pressable>
              <Button
                testID="delete-group-cancel"
                label="Cancel"
                variant="ghost"
                onPress={onClose}
              />
            </View>
          </View>
        </BottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}
