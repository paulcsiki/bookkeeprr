import { ScrollView, View, Text, Pressable } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { text } from '@/theme/typography';
import { useReaderTheme } from './ReaderThemeContext';

/** One jumpable chapter entry. Address is opaque to the panel. */
export interface TOCItem {
  label: string;
  /** Optional context line (e.g. a timecode or page number) — mono. */
  detail?: string;
  /**
   * Optional foliate href. The panel doesn't interpret it — it's carried so the
   * caller's `onJump(index)` can resolve the target. Used by the MOBI/AZW3
   * branch (whose TOC is href-addressed); EPUB leaves it unset (spine-indexed).
   */
  href?: string;
  /** Optional nesting depth (0 = top-level) — sub-entries indent by depth. */
  depth?: number;
}

export interface TOCPanelProps {
  items: TOCItem[];
  /** Index of the active chapter, highlighted. */
  activeIndex?: number;
  onDismiss: () => void;
  onJump: (index: number) => void;
}

/**
 * Table-of-contents sheet: a scrollable list of chapters with jump-to. Themed
 * from the reader palette so it reads as part of the reading surface.
 */
export function TOCPanel({ items, activeIndex, onDismiss, onJump }: TOCPanelProps) {
  const { palette } = useReaderTheme();
  return (
    <BottomSheet testID="reader-toc-panel" onDismiss={onDismiss}>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={[text.monoSm, { color: palette.inkSoft, marginBottom: 8, letterSpacing: 1 }]}>
          CONTENTS · {items.length}
        </Text>
      </View>
      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
        {items.map((item, i) => {
          const active = i === activeIndex;
          return (
            <Pressable
              key={i}
              testID={`reader-toc-item-${i}`}
              accessibilityRole="button"
              onPress={() => onJump(i)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                // Indent nested entries (foliate TOCs can nest); 0 for flat lists.
                paddingLeft: (item.depth ?? 0) * 16,
                borderBottomWidth: 1,
                borderBottomColor: palette.line,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={[text.monoSm, { color: palette.faint, width: 28 }]}>
                {String(i + 1)}
              </Text>
              <Text
                numberOfLines={1}
                style={[text.body, { flex: 1, color: active ? palette.accent : palette.ink }]}
              >
                {item.label}
              </Text>
              {item.detail ? (
                <Text style={[text.monoSm, { color: palette.faint }]}>{item.detail}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
