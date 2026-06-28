import { useEffect, useMemo } from 'react';
import { View, Image, Text, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTokens } from '@/theme/ThemeProvider';
import { COVER_POOL, type CoverEntry } from './coverPool';

/** Deterministic shuffle (mulberry32) so the arrangement is varied but stable
 * across mounts — and so adjacent columns don't repeat the same few covers. */
function shuffled(): CoverEntry[] {
  const arr = [...COVER_POOL];
  let seed = 0x9e3779b9;
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function CoverCard({ cv, w, h, titleColor }: { cv: CoverEntry; w: number; h: number; titleColor: string }) {
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: 7,
        overflow: 'hidden',
        backgroundColor: `hsl(${cv.hue}, 32%, 18%)`,
      }}
    >
      <Image
        source={cv.asset}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
      />
      <Text
        style={{
          position: 'absolute',
          bottom: 6,
          left: 6,
          right: 6,
          color: titleColor,
          opacity: 0.5,
          fontSize: 9,
          letterSpacing: 0.6,
        }}
      >
        {cv.title.toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * One vertically-drifting column. The covers are rendered twice back-to-back and
 * the column translates by exactly one set's height before looping, so the loop
 * is seamless. `up` columns scroll toward the top; the others scroll down. Only
 * a numeric `translateY` is animated (no string layout values), which keeps
 * reanimated's node manager happy on-device.
 */
function DriftColumn({
  covers,
  w,
  h,
  gap,
  up,
  duration,
  titleColor,
}: {
  covers: CoverEntry[];
  w: number;
  h: number;
  gap: number;
  up: boolean;
  duration: number;
  titleColor: string;
}) {
  const setHeight = covers.length * (h + gap);
  const ty = useSharedValue(up ? 0 : -setHeight);
  useEffect(() => {
    ty.value = up ? 0 : -setHeight;
    ty.value = withRepeat(
      withTiming(up ? -setHeight : 0, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [ty, up, setHeight, duration]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  return (
    <Animated.View style={[{ width: w, gap }, style]}>
      {[...covers, ...covers].map((cv, i) => (
        <CoverCard key={`${cv.isbn}-${i}`} cv={cv} w={w} h={h} titleColor={titleColor} />
      ))}
    </Animated.View>
  );
}

/**
 * Drifting wall of cover art used as the decorative backdrop on the Welcome
 * onboarding screen — the mobile counterpart of the web sign-in `CoverWall`.
 * Columns alternate scroll direction across three speed lanes; the whole wall is
 * tilted -17° to match the web. Covers are bundled (compressed webp) so the wall
 * fills instantly with no duplicates, even before a server is connected. Purely
 * decorative (hidden from a11y).
 */
export function CoverBand({ rotation = -17 }: { rotation?: number } = {}) {
  const t = useTokens();
  const { width, height } = useWindowDimensions();
  const W = 110;
  const GAP = 14;
  const H = Math.round(W * 1.5);
  // Size the grid to cover the viewport AFTER the -rotation° tilt: a rotated
  // W×H rectangle needs a bounding box of (W·cosθ + H·sinθ) by (W·sinθ + H·cosθ)
  // to leave no corner gaps. +1 row/col of slack, capped so an XL tablet never
  // mounts a runaway number of tiles.
  const rad = (Math.abs(rotation) * Math.PI) / 180;
  const needW = width * Math.cos(rad) + height * Math.sin(rad);
  const needH = width * Math.sin(rad) + height * Math.cos(rad);
  // +3 cols / +2 rows of slack: the grid is centered, so the extra spills evenly
  // past both edges and guarantees the tilted wall overshoots every corner.
  const cols = Math.min(18, Math.ceil(needW / (W + GAP)) + 3);
  const perCol = Math.min(13, Math.ceil(needH / (H + GAP)) + 2);
  const columns = useMemo(() => {
    const pool = shuffled();
    const arr: CoverEntry[][] = [];
    let cursor = 0;
    for (let c = 0; c < cols; c++) {
      const colCovers: CoverEntry[] = [];
      for (let r = 0; r < perCol; r++) {
        colCovers.push(pool[cursor % pool.length]!);
        cursor++;
      }
      arr.push(colCovers);
    }
    return arr;
  }, [cols, perCol]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.22, overflow: 'hidden' }}
    >
      <View
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: [
            { translateX: -(cols * (W + GAP)) / 2 },
            { translateY: -(perCol * (H + GAP)) / 2 },
            { rotate: `${rotation}deg` },
          ],
          flexDirection: 'row',
          gap: GAP,
        }}
      >
        {columns.map((colCovers, ci) => (
          <DriftColumn
            key={ci}
            covers={colCovers}
            w={W}
            h={H}
            gap={GAP}
            up={ci % 2 === 0}
            duration={44000 + (ci % 3) * 13000}
            titleColor={t.coverTitle}
          />
        ))}
      </View>
    </View>
  );
}
