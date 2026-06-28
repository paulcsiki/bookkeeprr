import { Modal, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { X } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { BottomSheet } from '@/components/BottomSheet';
import { IconButton } from '@/components/IconButton';
import { GroupOptionRow } from './GroupOptionRow';
import { pickerOptions, type GroupNode } from './lib';

interface Props {
  visible: boolean;
  /** Currently selected group id, or null for Library root. */
  value: number | null;
  groups: GroupNode[];
  onSelect: (id: number | null) => void;
  onClose: () => void;
  /** Sheet title. Defaults to 'Choose group'. */
  title?: string;
}

/**
 * Single-tap group picker sheet — the Move sheet's row tree minus the series
 * header and minus inline create. Used in the add flow and anywhere a group
 * needs to be chosen without the full move UX.
 *
 * Hosted in a transparent Modal (ManualGrabSheet pattern) so it renders over
 * the full window regardless of where it's triggered in the component tree.
 * Selecting a row fires onSelect + closes immediately (no confirm button).
 */
export function GroupPickerSheet({
  visible,
  value,
  groups,
  onSelect,
  onClose,
  title = 'Choose group',
}: Props) {
  const t = useTokens();
  const { height: winHeight } = useWindowDimensions();

  // pickerOptions() prepends {id: null, name: 'Library root'} — render it as
  // the root row plus the tree below, matching MoveToGroupSheet geometry.
  const options = pickerOptions(groups);

  function pick(id: number | null) {
    onSelect(id);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <BottomSheet testID="group-picker-sheet" onDismiss={onClose}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 18,
            paddingBottom: 14,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontFamily: fonts.display.semibold,
              fontSize: 17,
              letterSpacing: -0.34,
              color: t.text,
            }}
          >
            {title}
          </Text>
          <IconButton testID="picker-close" accessibilityLabel="Close" onPress={onClose}>
            <X size={16} color={t.textMuted} strokeWidth={1.75} />
          </IconButton>
        </View>

        {/* Rows — scrollable when the tree outgrows half the window. */}
        <ScrollView style={{ maxHeight: Math.round(winHeight * 0.5) }} bounces={false}>
          {options.map((o) => (
            <GroupOptionRow
              key={o.id === null ? 'root' : o.id}
              testID={o.id === null ? 'picker-row-root' : `picker-row-${o.id}`}
              name={o.id === null ? 'Library · no group' : o.name}
              depth={o.depth}
              on={value === o.id}
              onPress={() => pick(o.id)}
            />
          ))}
        </ScrollView>
      </BottomSheet>
    </Modal>
  );
}
