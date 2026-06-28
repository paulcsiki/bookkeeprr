import { Modal, Pressable, Text, View } from 'react-native';
import { Folder, FolderPlus, Pencil, Trash2, type LucideIcon } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { BottomSheet } from '@/components/BottomSheet';
import type { GroupNode } from './lib';

interface Props {
  group: GroupNode | null;
  visible: boolean;
  onClose: () => void;
  onRename: () => void;
  onNewSubgroup: () => void;
  onDelete: () => void;
}

// Row idiom per UserActionsSheet's ActionRow: icon + label, errFg for danger.
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
  testID: string;
}) {
  const t = useTokens();
  const color = tone === 'danger' ? t.errFg : t.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}
    >
      <Icon size={20} color={color} strokeWidth={1.75} />
      <Text style={[text.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Long-press a GroupRow (phone) or FolderCard (tablet) → this sheet.
 * Pure dispatcher: each row hands control back to the parent, which opens
 * the matching Rename / Create / Delete sheet.
 */
export function GroupActionsSheet({
  group,
  visible,
  onClose,
  onRename,
  onNewSubgroup,
  onDelete,
}: Props) {
  const t = useTokens();
  if (group === null) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <BottomSheet testID="group-actions-sheet" onDismiss={onClose}>
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 }}>
          {/* Header: folder tile (GroupRow idiom, fan-less) + name + mono path. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingBottom: 10,
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                flexShrink: 0,
                backgroundColor: t.surfaceMuted,
                borderWidth: 1,
                borderColor: t.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Folder size={19} color={t.textMuted} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fonts.display.semibold,
                  fontSize: 17,
                  letterSpacing: -0.34, // -0.02em × 17px
                  color: t.text,
                }}
              >
                {group.name}
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
          </View>
          <ActionRow icon={Pencil} label="Rename" testID="group-action-rename" onPress={onRename} />
          <ActionRow
            icon={FolderPlus}
            label="New subgroup"
            testID="group-action-subgroup"
            onPress={onNewSubgroup}
          />
          <ActionRow
            icon={Trash2}
            label="Delete…"
            tone="danger"
            testID="group-action-delete"
            onPress={onDelete}
          />
        </View>
      </BottomSheet>
    </Modal>
  );
}
