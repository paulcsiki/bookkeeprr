import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  cancelAnimation,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import FastImage from 'react-native-fast-image';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTokens } from '@/theme/ThemeProvider';
import { hueFromString } from '@/theme/color';
import { useMoveSeriesToGroup } from '@/api/hooks';
import { registerFrame, hitTestList, decodeDropTarget, shouldMove, type DropFrame } from './dnd';

/** The slice of a series the drag needs: identity + proxy art + current location. */
export interface DragSeries {
  id: number;
  title: string;
  coverUrl: string | null;
  groupId: number | null;
}

interface GroupDndContextValue {
  enabled: boolean;
  dragging: boolean;
  /** Drop-target id currently hovered by the drag, or null. */
  hotTarget: string | null;
  /** Report a measured frame (null unregisters, e.g. on unmount). */
  registerDropFrame: (id: string, frame: DropFrame | null) => void;
  /** Register a re-measure callback, invoked when a drag lifts (null unregisters). */
  registerMeasure: (id: string, fn: (() => void) | null) => void;
  /** JS-side drag lifecycle, invoked from the gesture via runOnJS. */
  beginDrag: (series: DragSeries) => void;
  finishDrag: (targetId: string | null) => void;
  /** JS-side hot-target setState — called only when the hovered target changes. */
  setHot: (targetId: string | null) => void;
  // Shared values driving the proxy + UI-thread hit-testing.
  framesSV: SharedValue<DropFrame[]>;
  lastTargetSV: SharedValue<string | null>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
}

const GroupDndContext = createContext<GroupDndContextValue | null>(null);

/** Drag-proxy thumbnail size (2/3 cover ratio). */
const PROXY_W = 90;
const PROXY_H = 135;
const LIFT_MS = 250;
const SPRING = { damping: 24, stiffness: 280, mass: 0.7 };

interface ProviderProps {
  /** Tablet browse mode only — when false the provider is fully inert. */
  enabled: boolean;
  /** Mirror of the internal dragging flag (LibraryHome locks its ScrollView). */
  onDraggingChange?: (dragging: boolean) => void;
  children: ReactNode;
}

/**
 * Tablet drag-and-drop scaffolding for library groups. Holds the measured
 * drop frames (folder cards + breadcrumb pills), the reanimated drag proxy,
 * and the hot-target state. Hit-testing runs on the UI thread against a
 * shared-value mirror of the frames; runOnJS fires ONLY when the hovered
 * target changes, never per move event. Numeric values only inside
 * useAnimatedStyle (string layout values segfault reanimated on device).
 */
export function GroupDndProvider({ enabled, onDraggingChange, children }: ProviderProps) {
  const t = useTokens();
  const move = useMoveSeriesToGroup();
  const [drag, setDrag] = useState<DragSeries | null>(null);
  const [hotTarget, setHotTarget] = useState<string | null>(null);

  // Canonical frames map on JS; mirrored into a shared value (plain array)
  // so the pan gesture can hit-test on the UI thread without bridging.
  const framesRef = useRef(new Map<string, DropFrame>());
  const measuresRef = useRef(new Map<string, () => void>());
  const dragRef = useRef<DragSeries | null>(null);

  const framesSV = useSharedValue<DropFrame[]>([]);
  const lastTargetSV = useSharedValue<string | null>(null);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // Window offset of the overlay container — measureInWindow frames and the
  // pan's absoluteX/Y are window coords; the proxy renders inside the overlay.
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const overlayRef = useRef<View>(null);

  const registerDropFrame = useCallback(
    (id: string, frame: DropFrame | null) => {
      if (frame === null) framesRef.current.delete(id);
      else registerFrame(framesRef.current, frame);
      framesSV.value = Array.from(framesRef.current.values());
    },
    [framesSV],
  );

  const registerMeasure = useCallback((id: string, fn: (() => void) | null) => {
    if (fn === null) measuresRef.current.delete(id);
    else measuresRef.current.set(id, fn);
  }, []);

  const beginDrag = useCallback(
    (series: DragSeries) => {
      // onLayout frames go stale once the grid scrolls (scroll does not
      // re-layout children) — re-measure every registered target at lift
      // time. Scrolling is locked for the rest of the drag, so the refreshed
      // frames stay valid until release.
      for (const fn of measuresRef.current.values()) fn();
      overlayRef.current?.measureInWindow?.((x: number, y: number) => {
        originX.value = x;
        originY.value = y;
      });
      dragRef.current = series;
      setDrag(series);
      onDraggingChange?.(true);
    },
    [onDraggingChange, originX, originY],
  );

  const finishDrag = useCallback(
    (targetId: string | null) => {
      const series = dragRef.current;
      if (series === null) return; // spurious finalize (tap that never lifted)
      if (shouldMove(series.groupId, targetId)) {
        // decodeDropTarget is non-null when shouldMove returns true.
        const decoded = decodeDropTarget(targetId!)!;
        move.mutate({ seriesId: series.id, groupId: decoded.groupId });
      }
      dragRef.current = null;
      lastTargetSV.value = null;
      setDrag(null);
      setHotTarget(null);
      onDraggingChange?.(false);
    },
    [move, lastTargetSV, onDraggingChange],
  );

  const setHot = useCallback((targetId: string | null) => setHotTarget(targetId), []);

  const proxyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value - originX.value - PROXY_W / 2 },
      { translateY: ty.value - originY.value - PROXY_H / 2 },
      { scale: 1.05 },
    ],
  }));

  if (!enabled) return <>{children}</>;

  const hue = drag !== null ? hueFromString(drag.title) : 0;
  return (
    <GroupDndContext.Provider
      value={{
        enabled,
        dragging: drag !== null,
        hotTarget,
        registerDropFrame,
        registerMeasure,
        beginDrag,
        finishDrag,
        setHot,
        framesSV,
        lastTargetSV,
        tx,
        ty,
        startX,
        startY,
      }}
    >
      {children}
      {/* Full-screen overlay hosting the drag proxy. Absolute within the
          nearest screen container; its window offset is measured at lift so
          proxy coords can subtract it (numeric-only animated transform). */}
      <View
        ref={overlayRef}
        pointerEvents="none"
        collapsable={false}
        style={StyleSheet.absoluteFill}
      >
        {drag !== null ? (
          <Animated.View
            testID="dnd-proxy"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: PROXY_W,
                height: PROXY_H,
                borderRadius: 8,
                shadowColor: t.coverTitleShadow,
                shadowOpacity: 0.6,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 8 },
                elevation: 12,
              },
              proxyStyle,
            ]}
          >
            <View
              style={{
                flex: 1,
                borderRadius: 8,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: t.onDarkBorder,
              }}
            >
              <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                <Defs>
                  <LinearGradient id="dndproxybg" x1="0" y1="0" x2="0.34" y2="1">
                    <Stop offset="0" stopColor={`hsl(${hue} 35% 22%)`} />
                    <Stop offset="1" stopColor={`hsl(${hue} 30% 12%)`} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#dndproxybg)" />
              </Svg>
              {drag.coverUrl ? (
                <FastImage source={{ uri: drag.coverUrl }} style={StyleSheet.absoluteFill} />
              ) : null}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </GroupDndContext.Provider>
  );
}

/** Provider state for screens (inert defaults outside a provider). */
export function useGroupDnd(): { enabled: boolean; dragging: boolean } {
  const ctx = useContext(GroupDndContext);
  return { enabled: ctx?.enabled ?? false, dragging: ctx?.dragging ?? false };
}

interface DropTargetProps {
  /** Encoded target id: `group-<id>` | `crumb-<id|root>` (see dnd.ts). */
  id: string;
  style?: ViewStyle;
  children: (hot: boolean) => ReactNode;
}

/**
 * Measured drop target. Reports its window frame to the provider on layout
 * (and re-measures when a drag lifts), unregisters on unmount, and tells its
 * child whether the active drag is hovering it. Renders children unchanged
 * (never hot) outside an enabled provider — phones stay inert.
 */
export function DropTarget({ id, style, children }: DropTargetProps) {
  const ctx = useContext(GroupDndContext);
  const enabled = ctx?.enabled ?? false;
  const registerDropFrame = ctx?.registerDropFrame;
  const registerMeasure = ctx?.registerMeasure;
  const ref = useRef<View>(null);

  const measure = useCallback(() => {
    ref.current?.measureInWindow?.((x: number, y: number, w: number, h: number) => {
      registerDropFrame?.(id, { id, x, y, w, h });
    });
  }, [id, registerDropFrame]);

  useEffect(() => {
    if (!enabled || !registerMeasure || !registerDropFrame) return;
    registerMeasure(id, measure);
    return () => {
      registerMeasure(id, null);
      registerDropFrame(id, null);
    };
  }, [enabled, id, measure, registerMeasure, registerDropFrame]);

  return (
    <View ref={ref} collapsable={false} style={style} onLayout={enabled ? measure : undefined}>
      {children(ctx !== null && ctx.hotTarget === id)}
    </View>
  );
}

interface SeriesDragSourceProps {
  series: DragSeries;
  children: ReactNode;
}

/**
 * Wraps a series card with the lift-and-drag gesture: a Pan that activates
 * after a 250 ms long-press (gesture-handler v3 deprecates Gesture.LongPress
 * composition in favour of Pan.activateAfterLongPress). While panning, the
 * worklet updates the proxy's shared values and hit-tests on the UI thread;
 * runOnJS fires only when the hovered target CHANGES. Release over a target
 * moves the series; release elsewhere springs the proxy back. Outside an
 * enabled provider it renders children unchanged (no gesture attaches).
 */
export function SeriesDragSource({ series, children }: SeriesDragSourceProps) {
  const ctx = useContext(GroupDndContext);

  // Keep a ref so worklet callbacks always read the freshest payload without
  // rebuilding the gesture object. Updated unconditionally every render so
  // the value is current at the moment onStart fires.
  const payloadRef = useRef<DragSeries>({
    id: series.id,
    title: series.title,
    coverUrl: series.coverUrl,
    groupId: series.groupId,
  });
  payloadRef.current = {
    id: series.id,
    title: series.title,
    coverUrl: series.coverUrl,
    groupId: series.groupId,
  };

  // Extract stable callbacks + identity values used as memo deps. When ctx is
  // null we fall back to no-ops so the dep array is always defined.
  const framesSV = ctx?.framesSV;
  const lastTargetSV = ctx?.lastTargetSV;
  const tx = ctx?.tx;
  const ty = ctx?.ty;
  const startX = ctx?.startX;
  const startY = ctx?.startY;
  const beginDrag = ctx?.beginDrag;
  const finishDrag = ctx?.finishDrag;
  const setHot = ctx?.setHot;

  // Memoize the Gesture.Pan() object so a mid-drag re-render (e.g. TanStack
  // invalidation) does NOT hand the gesture system a new instance, which would
  // cancel / spring-back an active drag. Keyed on stable provider callbacks
  // and series identity; payloadRef lets onStart always read the current value
  // without appearing in the dep array.
  const pan = useMemo(() => {
    if (
      framesSV === undefined ||
      lastTargetSV === undefined ||
      tx === undefined ||
      ty === undefined ||
      startX === undefined ||
      startY === undefined ||
      beginDrag === undefined ||
      finishDrag === undefined ||
      setHot === undefined
    ) {
      return null;
    }
    return Gesture.Pan()
      .activateAfterLongPress(LIFT_MS)
      .maxPointers(1)
      .onStart((e) => {
        // Cancel any spring-back still running from a previous drag so its
        // completion callback (runOnJS finishDrag(null)) cannot fire against
        // the new drag's dragRef.
        cancelAnimation(tx);
        cancelAnimation(ty);
        startX.value = e.absoluteX;
        startY.value = e.absoluteY;
        tx.value = e.absoluteX;
        ty.value = e.absoluteY;
        lastTargetSV.value = null;
        // Read payloadRef.current at drag-start so the freshest series
        // identity is captured even if the component re-rendered between
        // gesture creation and lift.
        runOnJS(beginDrag)(payloadRef.current);
      })
      .onUpdate((e) => {
        tx.value = e.absoluteX;
        ty.value = e.absoluteY;
        const target = hitTestList(framesSV.value, e.absoluteX, e.absoluteY);
        if (target !== lastTargetSV.value) {
          lastTargetSV.value = target;
          // Throttled by design: only a target CHANGE crosses to JS.
          runOnJS(setHot)(target);
        }
      })
      .onEnd((e) => {
        const target = hitTestList(framesSV.value, e.absoluteX, e.absoluteY);
        if (target !== null) {
          runOnJS(finishDrag)(target);
        } else {
          tx.value = withSpring(startX.value, SPRING);
          ty.value = withSpring(startY.value, SPRING, () => {
            runOnJS(finishDrag)(null);
          });
        }
      })
      .onFinalize((_e, success) => {
        // Safety net for system-cancelled drags. finishDrag no-ops when the
        // drag already completed (or never lifted — plain taps land here too).
        if (!success) runOnJS(finishDrag)(null);
      });
  }, [
    series.id,
    series.groupId,
    framesSV,
    lastTargetSV,
    tx,
    ty,
    startX,
    startY,
    beginDrag,
    finishDrag,
    setHot,
  ]);

  // Render plain children when the provider is absent, disabled, or the gesture
  // could not be built (should not happen in practice when enabled=true).
  if (ctx === null || !ctx.enabled || pan === null) return <>{children}</>;

  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
}
