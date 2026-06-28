/**
 * Pure timeline math for a multi-track audio volume. A volume's tracks form a
 * single continuous timeline: the global position is measured against the
 * concatenated track durations. These helpers map between a global second and
 * the per-track coordinate the player actually plays.
 *
 * No DOM, no React — safe to unit-test in a node environment. Null durations
 * (a track whose length we couldn't probe) are treated as 0.
 *
 * Ported verbatim from the web reader (`apps/web/src/components/reader/lib/
 * audio-timeline.ts`) to keep web/mobile parity; the web unit test vectors are
 * mirrored under `tests/unit/reader/audio-timeline.test.ts`.
 */

/** The slice of an audio track the timeline math needs. */
export interface TimelineTrack {
  durationSec: number | null;
}

/** A point on the timeline: which track, and the offset within it. */
export interface TrackPoint {
  trackIdx: number;
  offsetSec: number;
}

function dur(track: TimelineTrack | undefined): number {
  const d = track?.durationSec;
  return d != null && d > 0 ? d : 0;
}

/** Total seconds across all tracks (null durations count as 0). */
export function totalDuration(tracks: readonly TimelineTrack[]): number {
  let total = 0;
  for (const t of tracks) total += dur(t);
  return total;
}

/** Cumulative start second of each track, in track order. */
export function trackBoundaries(tracks: readonly TimelineTrack[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const t of tracks) {
    starts.push(acc);
    acc += dur(t);
  }
  return starts;
}

/**
 * Map a global second to a `{ trackIdx, offsetSec }`. Clamps below 0 to the
 * first track and at/above the total to the last track's final second.
 */
export function globalToTrack(tracks: readonly TimelineTrack[], globalSec: number): TrackPoint {
  if (tracks.length === 0) return { trackIdx: 0, offsetSec: 0 };
  const starts = trackBoundaries(tracks);
  const g = Number.isNaN(globalSec) ? 0 : Math.max(0, globalSec);
  // Walk from the last track down: the first whose start is <= g owns it.
  for (let i = tracks.length - 1; i >= 0; i--) {
    const start = starts[i] ?? 0;
    if (g >= start) {
      const d = dur(tracks[i]);
      // Clamp the offset within the owning track (last track may overshoot).
      const offset = i === tracks.length - 1 ? Math.max(0, g - start) : g - start;
      return { trackIdx: i, offsetSec: d > 0 ? Math.min(offset, d) : offset };
    }
  }
  return { trackIdx: 0, offsetSec: 0 };
}

/** Map a per-track coordinate back to a global second. */
export function trackToGlobal(
  tracks: readonly TimelineTrack[],
  trackIdx: number,
  offsetSec: number,
): number {
  if (tracks.length === 0) return 0;
  const idx = Math.max(0, Math.min(tracks.length - 1, trackIdx));
  const starts = trackBoundaries(tracks);
  return (starts[idx] ?? 0) + Math.max(0, offsetSec);
}
