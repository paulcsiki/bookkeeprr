'use client';

import { useEffect, useRef } from 'react';
import { useDemoMachine } from './useDemoMachine';
import { DemoStage } from './DemoStage';

export function LiveDemo(): React.JSX.Element {
  const { phase, start, reset } = useDemoMachine();
  const shellRef = useRef<HTMLDivElement>(null);

  // The machine stays frozen on its idle frame until the section scrolls into
  // view — so the demo only begins playing when it's actually visible (and not
  // wasted/already finished off-screen on a long page). One observer call kicks
  // it off after a brief delay (matching the prototype's 400ms).
  const hasStartedRef = useRef(false);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasStartedRef.current) {
            hasStartedRef.current = true;
            // Small delay to let the section's entrance animation finish.
            setTimeout(() => start(), 400);
          }
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, [start]);

  return (
    <section className="section" id="demo">
      <div className="wrap">
        <div ref={shellRef} className={`demo-shell${phase === 'complete' ? ' demo-complete' : ''}`}>
          <DemoStage phase={phase} />

          {/* Replay scrim — only shown when demo completes */}
          {phase === 'complete' && (
            <div className="demo-scrim complete">
              <button type="button" className="replay" onClick={reset}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-9-9" />
                  <path d="M21 4v5h-5" />
                </svg>
                Replay
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
