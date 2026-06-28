/** Format a Date as a UTC calendar day, YYYY-MM-DD. */
export function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Step a YYYY-MM-DD day string back `n` UTC days. */
export function shiftDay(day: string, deltaDays: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return utcDayString(d);
}

/**
 * The last `count` UTC days ending on `today`, ascending (oldest first).
 */
export function lastNDays(today: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(shiftDay(today, -i));
  return out;
}
