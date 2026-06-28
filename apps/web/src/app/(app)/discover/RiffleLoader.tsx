'use client';

import { useEffect, useState } from 'react';
import { DTYPES, DSOURCES } from './fixtures';
import { hueGradient } from './hue-gradient';

// CSS-keyframe deck of five book-cover cards riffling continuously — mirrors
// the design's `disc-riffle` animation. Cards stagger via -duration/5 delays.
export function RiffleLoader({
  unit = 104,
  caption = true,
}: {
  unit?: number;
  caption?: boolean;
}): React.JSX.Element {
  const [src, setSrc] = useState(0);
  useEffect(() => {
    if (!caption) return undefined;
    const id = setInterval(() => setSrc((s) => (s + 1) % DSOURCES.length), 520);
    return () => clearInterval(id);
  }, [caption]);

  const w = unit;
  const h = Math.round(unit * 1.4);

  return (
    <>
      {/* Inject keyframes once. */}
      <style>{`
        @keyframes disc-riffle {
          0%   { transform: translateX(0) translateY(0) rotate(-7deg) scale(0.84); opacity: 0.45; z-index: 1; }
          14%  { transform: translateX(0) translateY(-7%) rotate(0deg) scale(1);    opacity: 1;    z-index: 6; }
          26%  { transform: translateX(78%) translateY(-12%) rotate(13deg) scale(1.03); opacity: 1; z-index: 6; }
          42%  { transform: translateX(0) translateY(0) rotate(-7deg) scale(0.84);  opacity: 0.45; z-index: 1; }
          100% { transform: translateX(0) translateY(0) rotate(-7deg) scale(0.84);  opacity: 0.45; z-index: 1; }
        }
      `}</style>
      <div
        className="flex flex-col items-center"
        style={{ gap: Math.round(unit * 0.42), userSelect: 'none' }}
      >
        <div
          className="relative grid place-items-center"
          style={{ width: w * 2.1, height: h * 1.25, perspective: 900 }}
        >
          {DTYPES.map((dtype, i) => {
            const accentVar = `var(--color-${dtype.k})`;
            return (
              <div
                key={dtype.k}
                style={{
                  position: 'absolute',
                  width: w,
                  height: h,
                  borderRadius: Math.max(5, Math.round(unit * 0.07)),
                  background: hueGradient(dtype.hue),
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 18px 36px -16px hsl(240 40% 2% / 0.7)',
                  overflow: 'hidden',
                  animation: 'disc-riffle 2.6s cubic-bezier(.55,.05,.35,1) infinite',
                  animationDelay: `calc(${i} * 2.6s / -5)`,
                }}
              >
                {/* type accent spine */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: Math.max(3, unit * 0.045),
                    background: accentVar,
                  }}
                />
                {/* subtle shine */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(120deg, hsl(0 0% 100% / 0.10) 0%, transparent 38%)',
                  }}
                />
                {/* decorative title bars */}
                <div
                  style={{
                    position: 'absolute',
                    left: unit * 0.16,
                    right: unit * 0.12,
                    bottom: unit * 0.16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: unit * 0.07,
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      height: Math.max(3, unit * 0.05),
                      width: '85%',
                      borderRadius: 99,
                      background: 'hsl(0 0% 100% / 0.55)',
                    }}
                  />
                  <span
                    style={{
                      display: 'block',
                      height: Math.max(3, unit * 0.05),
                      width: '55%',
                      borderRadius: 99,
                      background: 'hsl(0 0% 100% / 0.28)',
                    }}
                  />
                </div>
                {/* type dot */}
                <span
                  style={{
                    position: 'absolute',
                    top: unit * 0.1,
                    left: unit * 0.13,
                    width: unit * 0.1,
                    height: unit * 0.1,
                    borderRadius: 99,
                    background: accentVar,
                  }}
                />
              </div>
            );
          })}
        </div>
        {caption ? (
          <div className="flex flex-col items-center" style={{ gap: Math.round(unit * 0.1) }}>
            <div
              className="font-display text-foreground"
              style={{ fontSize: Math.round(unit * 0.2), fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              Searching every source
            </div>
            <div
              className="font-mono uppercase text-muted-foreground inline-flex items-center gap-2"
              style={{ fontSize: Math.round(unit * 0.13), letterSpacing: '0.08em' }}
            >
              <span
                className="inline-block rounded-full bg-primary"
                style={{
                  width: Math.round(unit * 0.08),
                  height: Math.round(unit * 0.08),
                  boxShadow: '0 0 0 4px color-mix(in oklab, var(--color-primary) 30%, transparent)',
                }}
              />
              <span style={{ minWidth: unit * 1.1, textAlign: 'left' }}>{DSOURCES[src]}…</span>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
