import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

export interface DonutSegment {
  color: string;
  value: number;
}

/**
 * A thin ring donut. Segments are drawn as stroke-dash arcs around a circle.
 * An all-zero total renders just the hollow track. Center content is overlaid.
 */
export function Donut({
  segments,
  size = 132,
  thickness = 18,
  track,
  children,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  track: string;
  children?: React.ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={thickness} fill="none" />
          {total > 0 &&
            segments
              .filter((s) => s.value > 0)
              .map((s, i) => {
                const frac = s.value / total;
                const len = frac * c;
                const dash = `${len} ${c - len}`;
                const el = (
                  <Circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={s.color}
                    strokeWidth={thickness}
                    strokeLinecap="butt"
                    fill="none"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })}
        </G>
      </Svg>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}
