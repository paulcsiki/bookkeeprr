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
import { displayPath, type GroupNode } from './lib';

interface Props {
  visible: boolean;
  /** Where the new group lands: null = library root, otherwise the parent group. */
  parentId: number | null;
  groups: GroupNode[];
  onClose: () => void;
}

/**
 * "New group" sheet — the browse screen's ghost row and the actions sheet's
 * "New subgroup" both land here; only `parentId` differs.
 *
 * Hosted in a transparent Modal (ManualGrabSheet pattern): the entry points
 * live inside screen ScrollViews, so a plain-sibling BottomSheet would render
 * squashed at the trigger's position instead of sliding over the full window.
 */
export function CreateGroupSheet({ visible, parentId, groups, onClose }: Props) {
  const t = useTokens();
  const { createGroup } = useGroupMutations();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-sync transient state every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setName('');
    setError(null);
  }, [visible]);

  const contextLine = `In · ${displayPath(groups, parentId) || 'Library'}`.toUpperCase();
  const disabled = name.trim().length === 0 || createGroup.isPending;

  function onCreate() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setError(null);
    createGroup.mutate(
      { name: trimmed, parentId },
      {
        // No toast idiom in the app — success is the sheet closing and the
        // invalidated groups list refetching the new row in.
        onSuccess: () => onClose(),
        onError: (e) =>
          setError(groupErrorMessage(e, "Couldn't create the group — check the server.")),
      },
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The sheet hugs the bottom edge, so the iOS keyboard covers the Create
          button while the name input is focused. Pad the sheet above the
          keyboard; Android resizes the window itself (adjustResize), so
          padding there would double-shift. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <BottomSheet testID="create-group-sheet" onDismiss={onClose}>
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
                  New group
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
                  {contextLine}
                </Text>
              </View>
              <IconButton testID="create-group-close" accessibilityLabel="Close" onPress={onClose}>
                <X size={16} color={t.textMuted} strokeWidth={1.75} />
              </IconButton>
            </View>
            <TextInput
              testID="create-group-input"
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              autoFocus
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
              <InlineAlert tone="err" body={error} testID="create-group-error" />
            ) : null}
            <Button
              testID="create-group-confirm"
              label={createGroup.isPending ? 'Creating…' : 'Create group'}
              onPress={onCreate}
              disabled={disabled}
              style={{ paddingVertical: 0, height: 48, borderRadius: 13 }}
            />
          </View>
        </BottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}
