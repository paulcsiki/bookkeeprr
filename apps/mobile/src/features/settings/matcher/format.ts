import type { ReplayRun } from '@/api/schemas';

/** Simple relative-time formatter (no external dep), matching the app's other screens. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const minutes = Math.floor(secs / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Web parity: null window = every retained release, else "last Nd". */
export function windowLabel(run: ReplayRun): string {
  return run.windowDays === null ? 'all retained' : `last ${run.windowDays}d`;
}
