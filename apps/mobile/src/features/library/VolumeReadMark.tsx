import { View } from 'react-native';
import { Check, BookOpen } from 'lucide-react-native';
import { useTokens } from '@/theme/ThemeProvider';
import type { Volume, ContentType } from '@/api/schemas';

// Foreground for the solid read badge — white reads on the saturated ok green in
// every theme/mode. Named to satisfy the no-color-literals lint rule.
const BADGE_FG = 'white';

/** Finished-state label, content-type aware: audiobooks are "Listened". */
function finishedLabel(contentType: ContentType | undefined): string {
  return contentType === 'audio' ? 'Listened' : 'Read';
}

/**
 * Per-volume read indicator shown next to the ownership StatusDot in volume
 * rows: a check for finished volumes, an open book for in-progress, nothing for
 * unread. The ownership dot says "do I have it"; this says "have I read it".
 */
export function VolumeReadMark({
  read,
  contentType,
  size = 15,
}: {
  read: Volume['read'];
  contentType?: ContentType;
  size?: number;
}) {
  const t = useTokens();
  if (read === 'finished') {
    // Check = "done" for every type; the label distinguishes Read vs Listened.
    return (
      <Check
        size={size}
        color={t.ok}
        strokeWidth={2.75}
        accessibilityLabel={finishedLabel(contentType)}
      />
    );
  }
  if (read === 'reading') {
    return (
      <BookOpen size={size} color={t.primary} strokeWidth={2} accessibilityLabel="In progress" />
    );
  }
  return null;
}

/**
 * Solid green check badge for marking a finished volume on top of a cover
 * thumbnail (where a bare stroked icon wouldn't read). Solid background per the
 * design rule — never translucent.
 */
export function ReadCheckBadge({
  size = 18,
  contentType,
}: {
  size?: number;
  contentType?: ContentType;
}) {
  const t = useTokens();
  return (
    <View
      accessibilityLabel={finishedLabel(contentType)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.ok,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Check size={Math.round(size * 0.66)} color={BADGE_FG} strokeWidth={3} />
    </View>
  );
}
