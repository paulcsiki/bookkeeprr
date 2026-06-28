import { useMemo, useRef, useState } from 'react';
import { View, Text, PanResponder, type LayoutChangeEvent } from 'react-native';
import { text } from '@/theme/typography';
import { useReaderTheme } from './ReaderThemeContext';
import { ScrubBubble, type ScrubPreview } from './ScrubBubble';

/** Clamp a raw x offset within a track of `width` to a 0..1 position. */
export function posFromGesture(x: number, width: number): number {
  if (width <= 0) return 0;
  const p = x / width;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

export interface ProgressRailProps {
  /** Current position, 0..1. */
  position: number;
  /** Left context label (e.g. `Page 12` or a timecode). Facts → rendered mono. */
  leftLabel?: string;
  /** Right context label (e.g. `30% · 188 left`). */
  rightLabel?: string;
  /** Called with a 0..1 position while/after scrubbing. */
  onScrub?: (pos: number) => void;
  /** When provided, shows a ScrubBubble preview above the thumb while dragging. */
  scrubPreview?: (pos: number) => ScrubPreview;
}

/**
 * Always-on thin progress rail with a draggable thumb. Drag is handled by a
 * `PanResponder` (simpler + more testable than gesture-handler for a 1-D
 * scrub); `posFromGesture` maps the touch x to a 0..1 position against the
 * measured track width. Themed from the reader palette; labels use mono.
 */
export function ProgressRail({ position, leftLabel, rightLabel, onScrub, scrubPreview }: ProgressRailProps) {
  const { palette } = useReaderTheme();
  const widthRef = useRef(0);
  const [width, setWidth] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [dragPos, setDragPos] = useState(position);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const p = posFromGesture(e.nativeEvent.locationX, widthRef.current);
          setDragPos(p);
          setScrubbing(true);
          onScrub?.(p);
        },
        onPanResponderMove: (e) => {
          const p = posFromGesture(e.nativeEvent.locationX, widthRef.current);
          setDragPos(p);
          onScrub?.(p);
        },
        onPanResponderRelease: () => {
          setScrubbing(false);
        },
        onPanResponderTerminate: () => {
          setScrubbing(false);
        },
      }),
    [onScrub],
  );

  const pct = Math.max(0, Math.min(1, position));
  const thumbLeft = width * pct;

  return (
    <View
      style={{
        paddingHorizontal: 22,
        paddingTop: 10,
        paddingBottom: 12,
        backgroundColor: palette.chrome,
        borderTopWidth: 1,
        borderTopColor: palette.line,
      }}
    >
      <View
        testID="reader-rail"
        onLayout={onLayout}
        {...responder.panHandlers}
        style={{ height: 18, justifyContent: 'center' }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 3,
            borderRadius: 99,
            backgroundColor: palette.line2,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            width: `${pct * 100}%`,
            height: 3,
            borderRadius: 99,
            backgroundColor: palette.accent,
          }}
        />
        <View
          testID="reader-rail-thumb"
          style={{
            position: 'absolute',
            left: thumbLeft - 6.5,
            width: 13,
            height: 13,
            borderRadius: 99,
            backgroundColor: palette.accent,
            transform: [{ scale: scrubbing ? 1.25 : 1 }],
          }}
        />
        {scrubbing && scrubPreview ? (
          <ScrubBubble preview={scrubPreview(dragPos)} position={dragPos} railWidth={width} />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={[text.monoSm, { color: palette.inkSoft }]}>{leftLabel ?? ''}</Text>
        <Text style={[text.monoSm, { color: palette.inkSoft }]}>{rightLabel ?? ''}</Text>
      </View>
    </View>
  );
}
