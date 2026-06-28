import { timeLeft } from '@/features/reader/lib/timeLeft';
import { OFFLINE_TTL_MS } from '@/features/reader/lib/offline-download';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MIN = 60 * 1000;

// remaining = (downloadedAt + OFFLINE_TTL_MS) - now
function dl(remainingMs: number, now: number): number {
  return now - OFFLINE_TTL_MS + remainingMs;
}

it('shows days when >= 1 day remains', () => {
  expect(timeLeft(dl(3 * DAY + 5 * HOUR, 0), 0)).toBe('3d left');
  expect(timeLeft(dl(1 * DAY, 0), 0)).toBe('1d left');
});

it('shows hours when < 1 day but >= 1 hour', () => {
  expect(timeLeft(dl(5 * HOUR, 0), 0)).toBe('5h left');
  // 90 minutes shows the LARGEST unit only → "1h left", not "90m"
  expect(timeLeft(dl(90 * MIN, 0), 0)).toBe('1h left');
});

it('shows minutes when < 1 hour', () => {
  expect(timeLeft(dl(45 * MIN, 0), 0)).toBe('45m left');
  expect(timeLeft(dl(1 * MIN, 0), 0)).toBe('1m left');
});

it('floors to "expiring soon" at/under zero', () => {
  expect(timeLeft(dl(0, 0), 0)).toBe('expiring soon');
  expect(timeLeft(dl(-5 * MIN, 0), 0)).toBe('expiring soon');
  expect(timeLeft(dl(30 * 1000, 0), 0)).toBe('expiring soon'); // <1m floors
});
