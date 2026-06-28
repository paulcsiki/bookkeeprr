import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { hueFromString } from '@/theme/color';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { Cover } from '@/components/Cover';
import { IconButton } from '@/components/IconButton';
import { InlineAlert } from '@/components/InlineAlert';
import { useGroupMutations, useLibraryGroups, useMoveSeriesToGroup } from '@/api/hooks';
import { LibraryGroup } from '@/api/schemas';
import { groupErrorMessage } from './errors';
import { GroupOptionRow } from './GroupOptionRow';
import { pickerOptions } from './lib';

interface MoveSeries {
  id: number;
  title: string;
  coverUrl: string | null;
  groupId: number | null;
}

interface Props {
  series: MoveSeries;
  visible: boolean;
  onClose: () => void;
}


/**
 * "Move to group" sheet — long-press a series on phones, or the series
 * detail's Group row on both form factors. Radio rows over the group tree,
 * an inline New group… creator, and a single Move button.
 *
 * Hosted in a transparent Modal (ManualGrabSheet pattern): the entry points
 * live inside screen ScrollViews, so a plain-sibling BottomSheet would render
 * squashed at the trigger's position instead of sliding over the full window.
 */
export function MoveToGroupSheet({ series, visible, onClose }: Props) {
  const t = useTokens();
  const { height: winHeight } = useWindowDimensions();
  const groupsQ = useLibraryGroups();
  const move = useMoveSeriesToGroup();
  const { createGroup } = useGroupMutations();

  const [selection, setSelection] = useState<number | null>(series.groupId);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  // The freshly created group, kept locally so the button can name it before
  // the invalidated ['library-groups'] query has refetched.
  const [created, setCreated] = useState<{ id: number; name: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Re-sync transient state every time the sheet opens (or the series the
  // parent points it at changes while open).
  useEffect(() => {
    if (!visible) return;
    setSelection(series.groupId);
    setNewOpen(false);
    setNewName('');
    setCreated(null);
    setCreateError(null);
    setMoveError(null);
  }, [visible, series.id, series.groupId]);

  const groups = groupsQ.data?.groups ?? [];
  // pickerOptions() prepends the {id: null, name: 'Library root'} entry; the
  // sheet renders its own root row (`Library · no group`) per the design.
  const treeOptions = pickerOptions(groups).filter((o) => o.id !== null);

  const currentName =
    series.groupId !== null
      ? (groups.find((g) => g.id === series.groupId)?.name ?? 'NO GROUP')
      : 'NO GROUP';
  const selectionName =
    selection === null
      ? 'Library'
      : (groups.find((g) => g.id === selection)?.name ?? created?.name ?? '…');

  const unchanged = selection === series.groupId;
  const confirmDisabled = unchanged || move.isPending || createGroup.isPending;

  function onSelect(id: number | null) {
    setSelection(id);
    setMoveError(null);
  }

  function onCreate() {
    const name = newName.trim();
    if (name.length === 0) return;
    setCreateError(null);
    // KEEP IT SIMPLE (per spec §3): the inline create is scoped to the
    // currently SELECTED row — the new group's parentId is the selection
    // (null → a root-level group; the hook omits parentId for root).
    createGroup.mutate(
      { name, parentId: selection },
      {
        onSuccess: (raw) => {
          const g = LibraryGroup.parse(raw);
          setCreated({ id: g.id, name: g.name });
          setSelection(g.id);
          setNewOpen(false);
          setNewName('');
        },
        onError: (e) =>
          setCreateError(groupErrorMessage(e, "Couldn't create the group — check the server.")),
      },
    );
  }

  function onConfirm() {
    setMoveError(null);
    move.mutate(
      { seriesId: series.id, groupId: selection },
      {
        onSuccess: () => onClose(),
        onError: () => setMoveError("Couldn't move the series — check the server."),
      },
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The sheet hugs the bottom edge, so the iOS keyboard covers the rows
          and Move button while the inline-create input is focused. Pad the
          sheet above the keyboard; Android resizes the window itself
          (adjustResize), so padding there would double-shift. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <BottomSheet testID="move-sheet" onDismiss={onClose}>
          {/* Header: cover thumb + display title + mono context sub + close. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 18,
              paddingBottom: 14,
            }}
          >
            <View style={{ width: 40, flexShrink: 0 }}>
              <Cover uri={series.coverUrl} hue={hueFromString(series.title)} size="sm" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: fonts.display.semibold,
                  fontSize: 17,
                  letterSpacing: -0.34, // -0.02em × 17px
                  color: t.text,
                }}
              >
                Move to group
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
                {`${series.title} · CURRENTLY IN ${currentName}`.toUpperCase()}
              </Text>
            </View>
            <IconButton testID="move-close" accessibilityLabel="Close" onPress={onClose}>
              <X size={16} color={t.textMuted} strokeWidth={1.75} />
            </IconButton>
          </View>

          {/* Rows — scrollable when the tree outgrows half the window. */}
          <ScrollView style={{ maxHeight: Math.round(winHeight * 0.5) }} bounces={false}>
            <GroupOptionRow
              testID="move-row-root"
              name="Library · no group"
              depth={0}
              on={selection === null}
              onPress={() => onSelect(null)}
            />
            {treeOptions.map((o) => (
              <GroupOptionRow
                key={o.id}
                testID={`move-row-${o.id}`}
                name={o.name}
                depth={o.depth}
                on={selection === o.id}
                onPress={() => onSelect(o.id)}
              />
            ))}
            {!newOpen ? (
              <GroupOptionRow
                testID="move-new-group"
                name="New group…"
                depth={0}
                on={false}
                isNew
                onPress={() => {
                  setNewOpen(true);
                  setCreateError(null);
                }}
              />
            ) : (
              <View
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  gap: 8,
                  borderTopWidth: 1,
                  borderTopColor: t.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    testID="move-new-group-input"
                    value={newName}
                    onChangeText={(v) => {
                      setNewName(v);
                      setCreateError(null);
                    }}
                    autoFocus
                    maxLength={40}
                    placeholder="Group name"
                    placeholderTextColor={t.textMuted}
                    style={{
                      flex: 1,
                      height: 40,
                      color: t.text,
                      backgroundColor: t.surfaceMuted,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: createError !== null ? t.errFg : t.border,
                      fontFamily: fonts.sans.regular,
                      fontSize: 14,
                    }}
                  />
                  <Button
                    testID="move-new-group-create"
                    label={createGroup.isPending ? 'Creating…' : 'Create'}
                    onPress={onCreate}
                    disabled={createGroup.isPending || newName.trim().length === 0}
                    style={{ paddingVertical: 0, height: 40, borderRadius: 10 }}
                  />
                </View>
                {createError !== null ? (
                  <Text
                    testID="move-create-error"
                    style={[text.bodySm, { color: t.errFg }]}
                  >
                    {createError}
                  </Text>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* Primary action. */}
          <View style={{ paddingHorizontal: 18, paddingTop: 14, gap: 10 }}>
            {moveError !== null ? (
              <InlineAlert tone="err" body={moveError} testID="move-error" />
            ) : null}
            <Button
              testID="move-confirm"
              label={move.isPending ? 'Moving…' : `Move to ${selectionName}`}
              onPress={onConfirm}
              disabled={confirmDisabled}
              style={{ paddingVertical: 0, height: 48, borderRadius: 13 }}
            />
          </View>
        </BottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}
