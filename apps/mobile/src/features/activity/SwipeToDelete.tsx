import { useRef, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
// gesture-handler v3 removed the legacy `Swipeable`; `ReanimatedSwipeable`
// (same props API) is its replacement, exported from this subpath.
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Trash2 } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import { text } from '@/theme/typography';

// Foreground for the destructive action: the err token is a saturated red in
// every theme/mode, so a constant white reads correctly on it. Named to satisfy
// the no-color-literals lint rule (mirrors DownloadRow's TRANSPARENT pattern).
const ACTION_FG = 'white';

interface Props {
  children: ReactNode;
  /** Called when the revealed action is tapped (or a full swipe is confirmed). */
  onDelete: () => void;
  /** Action label, e.g. "Cancel" (in-progress) or "Remove" (history/blocked). */
  label?: string;
  testID?: string;
}

/**
 * Swipe-left-to-reveal a destructive action behind a list row. The row itself
 * gets an opaque background so the action doesn't bleed through during the
 * swipe. Tapping the revealed action runs `onDelete` and closes the row.
 */
export function SwipeToDelete({ children, onDelete, label = 'Remove', testID }: Props) {
  const t = useTokens();
  const ref = useRef<SwipeableMethods>(null);

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
          style={{
            width: 96,
            backgroundColor: t.err,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <Trash2 size={18} color={ACTION_FG} strokeWidth={2} />
          <Text style={[text.monoSm, { color: ACTION_FG }]}>{label.toUpperCase()}</Text>
        </Pressable>
      )}
    >
      <View style={{ backgroundColor: t.bg }}>{children}</View>
    </ReanimatedSwipeable>
  );
}
