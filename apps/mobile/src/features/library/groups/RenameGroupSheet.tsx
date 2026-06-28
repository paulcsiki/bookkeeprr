import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { InlineAlert } from '@/components/InlineAlert';
import { useGroupMutations } from '@/api/hooks';
import { groupErrorMessage } from './errors';
import type { GroupNode } from './lib';

interface Props {
  group: GroupNode | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * "Rename group" sheet — prefilled with the current name, text preselected so
 * a fresh name is one keystroke away. Same Modal+BottomSheet+KAV host as the
 * other input-bearing group sheets.
 */
export function RenameGroupSheet({ group, visible, onClose }: Props) {
  const t = useTokens();
  const { renameGroup } = useGroupMutations();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-prefill every time the sheet opens (or is pointed at another group).
  useEffect(() => {
    if (!visible || group === null) return;
    setName(group.name);
    setError(null);
  }, [visible, group]);

  if (group === null) return null;

  const trimmed = name.trim();
  const disabled = trimmed.length === 0 || trimmed === group.name || renameGroup.isPending;

  function onSave() {
    if (group === null || trimmed.length === 0) return;
    setError(null);
    renameGroup.mutate(
      { id: group.id, name: trimmed },
      {
        onSuccess: () => onClose(),
        onError: (e) =>
          setError(groupErrorMessage(e, "Couldn't rename the group — check the server.")),
      },
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* iOS keyboard padding; Android resizes the window itself. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <BottomSheet testID="rename-group-sheet" onDismiss={onClose}>
          <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: fonts.display.semibold,
                    fontSize: 17,
                    letterSpacing: -0.34, // -0.02em × 17px
                    color: t.text,
                  }}
                >
                  Rename group
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: fonts.mono.regular,
                    fontSize: 10,
                    letterSpacing: 0.5, // 0.05em × 10px
                    color: t.textMuted,
                    marginTop: 2,
                  }}
                >
                  {group.path.toUpperCase()}
                </Text>
              </View>
              <IconButton testID="rename-group-close" accessibilityLabel="Close" onPress={onClose}>
                <X size={16} color={t.textMuted} strokeWidth={1.75} />
              </IconButton>
            </View>
            <TextInput
              testID="rename-group-input"
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              autoFocus
              selectTextOnFocus
              maxLength={40}
              placeholder="Group name"
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
            {error !== null ? (
              <InlineAlert tone="err" body={error} testID="rename-group-error" />
            ) : null}
            <Button
              testID="rename-group-confirm"
              label={renameGroup.isPending ? 'Saving…' : 'Save name'}
              onPress={onSave}
              disabled={disabled}
              style={{ paddingVertical: 0, height: 48, borderRadius: 13 }}
            />
          </View>
        </BottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}
