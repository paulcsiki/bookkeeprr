import { Pressable, Text, View } from 'react-native';
import { Folder, FolderPlus } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { mixSolid, withAlpha } from '@/theme/color';

/**
 * Shared radio row for GroupPickerSheet and MoveToGroupSheet.
 * 34px folder tile, 26px per-level indent, 20px radio circle on the right.
 * `isNew` renders the FolderPlus glyph + primary text (no radio).
 */
export function GroupOptionRow({
  name,
  depth,
  on,
  isNew,
  onPress,
  testID,
}: {
  name: string;
  depth: number;
  on: boolean;
  isNew?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const t = useTokens();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={isNew ? 'button' : 'radio'}
      accessibilityState={isNew ? undefined : { checked: on }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingRight: 18,
        paddingLeft: 18 + depth * 26,
        borderTopWidth: 1,
        borderTopColor: t.border,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          flexShrink: 0,
          backgroundColor: on ? mixSolid(t.primary, t.surface, 0.16) : t.surfaceMuted,
          borderWidth: 1,
          borderColor: on ? withAlpha(t.primary, 0.35) : t.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isNew ? (
          <FolderPlus size={16} color={t.primary} strokeWidth={1.7} />
        ) : (
          <Folder size={16} color={on ? t.primary : t.textMuted} strokeWidth={1.7} />
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: fonts.sans.medium,
          fontSize: 14.5,
          fontWeight: '500',
          color: isNew ? t.primary : t.text,
        }}
      >
        {name}
      </Text>
      {!isNew ? (
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: on ? t.primary : t.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {on ? (
            <View
              style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: t.primary }}
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
