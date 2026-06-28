import { ringProgress } from './chart-math';

type Props = {
  value: number;
  max: number;
  size?: number;
  thickness?: number;
  /** Accent token for the progress arc (defaults to themable primary). */
  accentVar?: string;
  /** Center content (e.g. a big number + caption). */
  children?: React.ReactNode;
};

/**
 * Circular progress ring (goals). Fills `value / max` of the circle, clamped to
 * 0..1; a 0% value shows only the hollow track. Hand-rolled SVG — no chart
 * library.
 */
export function ProgressRing({
  value,
  max,
  size = 92,
  thickness = 9,
  accentVar = '--color-primary',
  children,
}: Props): React.JSX.Element {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const { dash } = ringProgress(value, max, circumference);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-elevated-2)"
          strokeWidth={thickness}
        />
        {dash > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`var(${accentVar})`}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
