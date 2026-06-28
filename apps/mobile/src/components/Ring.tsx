import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

/** A single progress ring (value/max) with center content. */
export function Ring({
  value,
  max,
  size = 84,
  thickness = 8,
  color,
  track,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  color: string;
  track: string;
  children?: React.ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={thickness} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${pct * c} ${c}`}
          />
        </G>
      </Svg>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}
