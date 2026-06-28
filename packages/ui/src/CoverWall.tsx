'use client';

import { useEffect, useMemo, useState } from 'react';
import { COVER_POOL, coverUrl, type CoverPoolEntry } from './cover-pool';
import { cn } from './utils';

export type CoverWallProps = {
  pool?: ReadonlyArray<CoverPoolEntry>;
  /** Column count. With `responsive`, this is the *minimum* — the wall grows past it on wide screens. */
  cols?: number;
  /** Tiles per column. With `responsive`, this is the *minimum* — the wall grows past it on tall screens. */
  perCol?: number;
  /**
   * Size the wall to the viewport. The fixed `cols`/`perCol` (or their defaults)
   * become floors and the wall adds columns/rows — and grows its tilted canvas —
   * until it covers the screen edge-to-edge. Off by default so the component
   * stays a pure function of its props (the unit tests rely on that).
   */
  responsive?: boolean;
  className?: string;
};

const DIRECTIONS = ['up', 'down', 'up', 'down', 'up', 'down', 'up'] as const;
const SPEEDS = ['', 's1', 's2', '', 's2', 's1', ''] as const;

// Geometry of a single tile, mirrored from `.lcover` / `.login-col` / `.tilt`
// in globals.css. If those change, change these.
const TILE_W = 150; // .lcover width / .login-col flex-basis
const TILE_H = TILE_W * 1.5; // .lcover aspect-ratio 2 / 3
const GAP = 20; // .tilt gap + per-column gap
const COL_PITCH = TILE_W + GAP; // horizontal distance between column centers
const ROW_PITCH = TILE_H + GAP; // vertical distance between tiles (one set's height = perCol * this)
const TILT_DEG = 17; // .tilt rotate(-17deg)
// The tilt is centered at left:58% / top:50% (see `.login-wall .tilt`), so the
// far (left) edge is 58% of the width away from center — the wall has to reach it.
const CENTER_X = 0.58;
const CENTER_Y = 0.5;
// Guardrails so a freak viewport (8K, projector) can't explode the DOM. The pool
// is only 120 unique covers, so anything past this just repeats anyway.
const MAX_COLS = 48;
const MAX_PER_COL = 24;

export type CoverWallGrid = {
  cols: number;
  perCol: number;
  /** Width to give the tilted flex canvas so its centered columns reach both edges. */
  tiltWidth: number;
  /** Height of one (un-duplicated) column set — also the canvas height. */
  tiltHeight: number;
};

/**
 * Smallest grid (and tilt-canvas size) that fully covers a `vw × vh` viewport
 * once the canvas is rotated by {@link TILT_DEG} about its 58%/50% anchor.
 *
 * The canvas, in its own un-rotated frame, must contain the bounding box of the
 * viewport region rotated by the same angle — hence the cos/sin cross terms.
 * `minCols`/`minPerCol` act as floors so small screens keep the designed density.
 * Pure (no DOM) so it can be unit-tested directly.
 */
export function coverWallGrid(
  vw: number,
  vh: number,
  minCols: number,
  minPerCol: number,
): CoverWallGrid {
  const rad = (TILT_DEG * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Region the wall must blanket: symmetric about the anchor, so its half-width
  // is the distance to the *farther* horizontal edge (likewise vertically).
  const needW = 2 * Math.max(CENTER_X, 1 - CENTER_X) * vw;
  const needH = 2 * Math.max(CENTER_Y, 1 - CENTER_Y) * vh;

  // Un-rotated bounding box of that region.
  const spanW = needW * cos + needH * sin;
  const spanH = needW * sin + needH * cos;

  // +1 tile of slack on each axis so edges/corners never show a seam.
  const cols = Math.min(MAX_COLS, Math.max(minCols, Math.ceil(spanW / COL_PITCH) + 1));
  const perCol = Math.min(MAX_PER_COL, Math.max(minPerCol, Math.ceil(spanH / ROW_PITCH) + 1));

  return {
    cols,
    perCol,
    tiltWidth: cols * TILE_W + (cols - 1) * GAP,
    tiltHeight: perCol * ROW_PITCH,
  };
}

/**
 * Drifting wall of book covers used as the sign-in backdrop — see §18 in
 * `docs/design/bookkeeprr-design-system.html`. The wall renders cols × perCol
 * tiles in a -17° rotated container; columns alternate scroll direction and
 * use one of three speed lanes for a varied, non-repeating loop. Each column
 * is duplicated for seamless infinite scroll.
 *
 * With `responsive`, the column/row counts (and the tilt canvas size) are
 * recomputed from the viewport so the wall fills any resolution edge-to-edge,
 * treating `cols`/`perCol` as floors. Without it the wall is a pure function of
 * its props.
 *
 * Honors `prefers-reduced-motion` (animation disabled via the CSS rule).
 */
export function CoverWall({
  pool = COVER_POOL,
  cols = 7,
  perCol = 8,
  responsive = false,
  className,
}: CoverWallProps): React.JSX.Element {
  // Start from the props on both server and first client render so hydration
  // matches; `responsive` then upgrades to the measured grid in an effect.
  const [grid, setGrid] = useState<CoverWallGrid>(() => ({
    cols,
    perCol,
    tiltWidth: cols * TILE_W + (cols - 1) * GAP,
    tiltHeight: perCol * ROW_PITCH,
  }));

  useEffect(() => {
    if (!responsive) {
      setGrid({
        cols,
        perCol,
        tiltWidth: cols * TILE_W + (cols - 1) * GAP,
        tiltHeight: perCol * ROW_PITCH,
      });
      return;
    }
    let frame = 0;
    const measure = (): void => {
      cancelAnimationFrame(frame);
      // Throttle bursts of resize events into a single layout-synced recompute.
      frame = requestAnimationFrame(() => {
        setGrid(coverWallGrid(window.innerWidth, window.innerHeight, cols, perCol));
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [responsive, cols, perCol]);

  // Shuffle with a fixed-seed PRNG (not Math.random) so the arrangement is
  // identical on the server and on the client. A non-deterministic shuffle
  // here rendered a different wall on each side and threw a React hydration
  // mismatch. The wall still looks varied — just stable across reloads.
  const shuffled = useMemo(() => {
    const arr = [...pool];
    let seed = 0x9e3779b9; // any fixed seed; determinism is the point
    const rand = (): number => {
      // mulberry32 — small, dependency-free, deterministic.
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }, [pool]);

  let cursor = 0;
  const columns: CoverPoolEntry[][] = [];
  for (let c = 0; c < grid.cols; c++) {
    const colCovers: CoverPoolEntry[] = [];
    for (let r = 0; r < grid.perCol; r++) {
      colCovers.push(shuffled[cursor % shuffled.length]!);
      cursor++;
    }
    columns.push(colCovers);
  }

  // Only pin the canvas size when responsive — otherwise leave it to the CSS so
  // the prop-driven path (and its tests) behave exactly as before.
  const tiltStyle = responsive
    ? { width: grid.tiltWidth, height: grid.tiltHeight }
    : undefined;

  return (
    <div className={cn('login-wall', className)} aria-hidden>
      <div className="tilt" style={tiltStyle}>
        {columns.map((col, ci) => {
          const dir = DIRECTIONS[ci % DIRECTIONS.length];
          const speed = SPEEDS[ci % SPEEDS.length];
          const colClass = ['login-col', dir, speed].filter(Boolean).join(' ');
          return (
            <div key={ci} className={colClass}>
              {/* Render the set twice for seamless scroll. */}
              {[0, 1].map((dup) => (
                <div
                  key={dup}
                  style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}
                >
                  {col.map((cv, ri) => (
                    <div
                      key={`${ci}-${dup}-${ri}`}
                      className="lcover"
                      style={{
                        background: `linear-gradient(160deg, hsl(${cv.hue} 38% 26%), hsl(${cv.hue} 32% 13%) 65%, hsl(240 10% 7%))`,
                      }}
                    >
                      <span className="ph">{cv.title}</span>
                      <img
                        src={coverUrl(cv.isbn)}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).remove();
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
