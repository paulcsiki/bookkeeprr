export const PW_LABEL = ['', 'Weak', 'Fair', 'Strong'] as const;

export type PwLevel = 0 | 1 | 2 | 3;
export type PwAnalysis = {
  /** 0 = empty, 1 = weak, 2 = fair, 3 = strong. */
  level: PwLevel;
  /** Display label for the level (empty string at level 0). */
  label: string;
  /** The single most-impactful next step; empty-handed once strong. */
  hint: string;
  /** True once the password reaches the strong tier. */
  strong: boolean;
};

/**
 * Analyze password strength and surface the single most-impactful next step.
 * Adapted from the design handoff.
 *
 * "Strong" requires four basics: at least 8 characters, mixed case, a number,
 * and a symbol. Until all four are met the hint names the first one missing;
 * once they are, the password is strong and the hint stops nudging. (The
 * handoff also tiered on a 12-char rung, which contradicted the label — a
 * password could read "Strong" while the hint still said "to reach strong" —
 * so length beyond the 8-char minimum no longer changes the tier.)
 */
export function analyzePw(pw: string): PwAnalysis {
  const c = {
    len8: pw.length >= 8,
    mixed: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    num: /\d/.test(pw),
    sym: /[^A-Za-z0-9]/.test(pw),
  };
  const strong = c.len8 && c.mixed && c.num && c.sym;
  const variety = [c.mixed, c.num, c.sym].filter(Boolean).length;

  let level: PwLevel;
  if (pw.length === 0) level = 0;
  else if (strong) level = 3;
  else if (!c.len8 || variety <= 1) level = 1; // Weak
  else level = 2; // Fair

  let hint: string;
  if (pw.length === 0) hint = 'Use at least 8 characters.';
  else if (!c.len8) {
    const n = 8 - pw.length;
    hint = `Add ${n} more character${n === 1 ? '' : 's'} to meet the minimum.`;
  } else if (!c.mixed) hint = 'Mix upper- and lowercase letters.';
  else if (!c.num) hint = 'Add a number.';
  else if (!c.sym) hint = 'Add a symbol (!@#…) to reach strong.';
  else hint = 'Strong password — you’re all set.';

  return { level, label: PW_LABEL[level], hint, strong };
}
