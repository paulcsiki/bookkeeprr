/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { analyzePw } from '@/app/first-run/pw-score';

describe('analyzePw', () => {
  it('level 0 / not strong for empty', () => {
    const r = analyzePw('');
    expect(r.level).toBe(0);
    expect(r.strong).toBe(false);
    expect(r.label).toBe('');
  });
  it('weak (level 1) for a short password', () => expect(analyzePw('abc').level).toBe(1));
  it('strong (level 3) for a long mixed password', () => {
    const r = analyzePw('Abcdef12!@#$');
    expect(r.level).toBe(3);
    expect(r.strong).toBe(true);
    expect(r.label).toBe('Strong');
  });
  it('rises with length + variety', () => {
    expect(analyzePw('abcdefgh').level).toBeLessThanOrEqual(analyzePw('Abcdefg1!').level);
  });
  it('surfaces the single most-impactful next step', () => {
    expect(analyzePw('').hint).toMatch(/at least 8/i);
    expect(analyzePw('abc').hint).toMatch(/more character/i); // below the 8-char minimum
    expect(analyzePw('abcdefgh').hint).toMatch(/upper.*lowercase/i); // ≥8 but not mixed
    expect(analyzePw('Abcdefgh').hint).toMatch(/number/i); // mixed but no digit
    expect(analyzePw('Abcdefg1').hint).toMatch(/symbol/i); // digit but no symbol
    expect(analyzePw('Abcdef12!@#$').hint).toMatch(/all set/i); // everything met
  });
  it('does not nag once the four basics are met, even under 12 chars (regression)', () => {
    const r = analyzePw('Abcdefg1!'); // 9 chars: mixed case + number + symbol
    expect(r.level).toBe(3);
    expect(r.strong).toBe(true);
    expect(r.hint).toMatch(/all set/i);
    expect(r.hint).not.toMatch(/reach strong/i);
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingStage } from '@/app/first-run/OnboardingStage';
import type { FirstRunPaths } from '@/server/first-run/paths';

const writable: FirstRunPaths = {
  configDir: { path: '/config', status: 'writable' },
  mediaRoot: { path: '/media', status: 'writable' },
  configEnvSet: true,
  mediaEnvSet: true,
};
const qbtBlank = { host: '', port: 8080, username: '', password: '', useHttps: false };

describe('OnboardingStage flow', () => {
  it('shows Welcome first and advances to Admin on Begin setup', () => {
    render(<OnboardingStage adminExists={false} paths={writable} qbtInitial={qbtBlank} />);
    expect(screen.getByText('FIRST-RUN SETUP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Begin setup/i }));
    expect(screen.getByText('STEP 1 · ADMIN ACCOUNT')).toBeTruthy();
  });

  it('skips Welcome+Admin to Storage when an admin already exists', () => {
    render(<OnboardingStage adminExists paths={writable} qbtInitial={qbtBlank} />);
    expect(screen.getByText('STEP 2 · STORAGE')).toBeTruthy();
  });

  it('Continue is enabled on Storage when both paths are writable', () => {
    render(<OnboardingStage adminExists paths={writable} qbtInitial={qbtBlank} />);
    const cont = screen.getByRole('button', { name: /Continue/i }) as HTMLButtonElement;
    expect(cont.disabled).toBe(false);
  });

  it('Continue is disabled when a path is missing', () => {
    const bad: FirstRunPaths = { ...writable, mediaRoot: { path: '/media', status: 'missing' } };
    render(<OnboardingStage adminExists paths={bad} qbtInitial={qbtBlank} />);
    const cont = screen.getByRole('button', { name: /Continue/i }) as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
  });
});

describe('OnboardingStage paths + email', () => {
  it('admin step shows an Email field', () => {
    render(<OnboardingStage adminExists={false} paths={writable} qbtInitial={qbtBlank} />);
    fireEvent.click(screen.getByRole('button', { name: /Begin setup/i }));
    expect(document.querySelector('#admin-email')).toBeTruthy();
  });

  it('media row is read-only when BOOKKEEPRR_MEDIA_ROOT is set', () => {
    render(<OnboardingStage adminExists paths={writable} qbtInitial={qbtBlank} />);
    expect(document.querySelector('#media-root')).toBeNull();
  });

  it('media row is an editable input when env is unset', () => {
    const editable: FirstRunPaths = { ...writable, mediaEnvSet: false };
    render(<OnboardingStage adminExists paths={editable} qbtInitial={qbtBlank} />);
    expect(document.querySelector('#media-root')).toBeTruthy();
  });
});
