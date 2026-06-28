'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Book, Clock, Flame, Target, Minus, Plus, Activity, type LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fmtMins } from '@/components/dashboard/format';
import type { ReadingGoals } from '@/server/db/reading-goals';

/** Progress numerators the pace notes annotate against. */
export type GoalsProgress = {
  yearBooksDone: number;
  weekMinutesDone: number;
  streakDays: number;
};

/** Which goal block should be highlighted/focused when the dialog opens. */
export type GoalFocusKey = 'yearlyBooks' | 'weeklyMinutes' | 'streakDays' | null;

/** Per-goal draft: an on/off toggle plus its current numeric target. */
type GoalDraft = { enabled: boolean; target: number };
type Draft = {
  yearlyBooks: GoalDraft;
  weeklyMinutes: GoalDraft;
  streakDays: GoalDraft;
};

const DEFAULTS = { yearlyBooks: 24, weeklyMinutes: 300, streakDays: 30 } as const;

/** Seed a draft from the persisted goals (null → off, falling back to a sane default). */
function draftFromGoals(goals: ReadingGoals): Draft {
  return {
    yearlyBooks: {
      enabled: goals.yearlyBooks != null,
      target: goals.yearlyBooks ?? DEFAULTS.yearlyBooks,
    },
    weeklyMinutes: {
      enabled: goals.weeklyMinutes != null,
      target: goals.weeklyMinutes ?? DEFAULTS.weeklyMinutes,
    },
    streakDays: {
      enabled: goals.streakDays != null,
      target: goals.streakDays ?? DEFAULTS.streakDays,
    },
  };
}

// ── small controls ──────────────────────────────────────────────

function GoalSwitch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={label}
      className="relative h-[23px] w-10 shrink-0 cursor-pointer rounded-full border transition-colors"
      style={{
        background: on ? 'var(--color-primary)' : 'var(--color-elevated)',
        borderColor: on ? 'var(--color-primary)' : 'var(--color-border)',
      }}
    >
      <span
        className="absolute top-0.5 size-4 rounded-full transition-[left] duration-150"
        style={{
          left: on ? 19 : 2,
          background: on ? 'var(--color-primary-foreground)' : 'var(--color-muted-foreground)',
        }}
      />
    </button>
  );
}

function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  fmt,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  fmt: (v: number) => string;
  disabled: boolean;
}): React.JSX.Element {
  const set = (v: number): void => onChange(Math.max(min, Math.min(max, v)));
  const StepBtn = ({ icon: Icon, delta, label }: { icon: LucideIcon; delta: number; label: string }) => (
    <button
      type="button"
      onClick={() => set(value + delta)}
      disabled={disabled}
      aria-label={label}
      className="grid size-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-elevated text-foreground/80 transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
    >
      <Icon className="size-[15px]" aria-hidden />
    </button>
  );
  return (
    <div className="flex items-center gap-2.5">
      <StepBtn icon={Minus} delta={-step} label="Decrease" />
      <div
        className="min-w-[92px] text-center font-display text-[22px] font-semibold tracking-[-0.02em]"
        style={{ color: disabled ? 'var(--color-muted-foreground)' : 'var(--color-foreground)' }}
      >
        {fmt(value)}
      </div>
      <StepBtn icon={Plus} delta={step} label="Increase" />
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  accentVar,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled: boolean;
  accentVar: string;
}): React.JSX.Element {
  const pct = ((value - min) / (max - min)) * 100;
  const track = disabled
    ? 'var(--color-elevated)'
    : `linear-gradient(90deg, var(${accentVar}) ${pct}%, var(--color-elevated) ${pct}%)`;
  return (
    <input
      type="range"
      className="goal-slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ background: track }}
    />
  );
}

function Chips({
  options,
  value,
  onChange,
  disabled,
  fmt,
}: {
  options: number[];
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  fmt: (v: number) => string;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-[7px]">
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            disabled={disabled}
            className="h-7 rounded-full border px-3 font-mono text-[11.5px] font-medium transition-colors disabled:cursor-default disabled:opacity-40"
            style={{
              background: on ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)' : 'var(--color-elevated)',
              borderColor: on ? 'color-mix(in srgb, var(--color-primary) 38%, transparent)' : 'var(--color-border)',
              color: on ? 'var(--color-primary)' : 'var(--color-foreground)',
            }}
          >
            {fmt(o)}
          </button>
        );
      })}
    </div>
  );
}

function PaceNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-3 flex items-center gap-[7px] font-mono text-[11px] tracking-[0.02em] text-muted-foreground">
      <Activity className="size-[13px] shrink-0" aria-hidden />
      {children}
    </div>
  );
}

function GoalEditor({
  icon: Icon,
  accentVar,
  title,
  on,
  onToggle,
  focused,
  children,
}: {
  icon: LucideIcon;
  accentVar: string;
  title: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  focused: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="rounded-[13px] border p-4 transition-colors"
      style={{
        borderColor: focused
          ? 'color-mix(in srgb, var(--color-primary) 38%, transparent)'
          : 'var(--color-border)',
        background: on ? 'var(--color-card)' : 'transparent',
      }}
    >
      <div className="flex items-center gap-[11px]">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-[9px] border"
          style={{
            background: on ? `color-mix(in srgb, var(${accentVar}) 16%, transparent)` : 'var(--color-elevated)',
            borderColor: on ? `color-mix(in srgb, var(${accentVar}) 40%, transparent)` : 'var(--color-border)',
            color: on ? `var(${accentVar})` : 'var(--color-muted-foreground)',
          }}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-[14px] font-semibold text-foreground">{title}</div>
        <GoalSwitch on={on} onChange={onToggle} label={`Toggle ${title}`} />
      </div>
      {on && <div className="mt-3.5">{children}</div>}
    </div>
  );
}

/**
 * The Set / Edit reading-goals modal. Edits a local draft of the three goals;
 * Save PUTs the full `{yearlyBooks, weeklyMinutes, streakDays}` (each `null` when
 * its toggle is off) to `/api/reader/goals`, then refreshes and closes. Cancel /
 * Esc / backdrop discard the draft. "Turn all off" flips every toggle off in the
 * draft (does not persist until Save).
 */
export function GoalDialog({
  open,
  onOpenChange,
  goals,
  progress,
  focus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: ReadingGoals;
  progress: GoalsProgress;
  focus: GoalFocusKey;
}): React.JSX.Element {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>(() => draftFromGoals(goals));
  const [saving, setSaving] = React.useState(false);

  // Reseed the draft each time the dialog opens (discarding any prior edits).
  React.useEffect(() => {
    if (open) {
      setDraft(draftFromGoals(goals));
      setSaving(false);
    }
  }, [open, goals]);

  const upd = (key: keyof Draft, patch: Partial<GoalDraft>): void =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  const yb = draft.yearlyBooks;
  const wt = draft.weeklyMinutes;
  const st = draft.streakDays;
  const anyOn = yb.enabled || wt.enabled || st.enabled;

  const monthsLeft = 12 - new Date().getMonth();
  const perMonth = yb.target ? String(Number((yb.target / 12).toFixed(1))).replace(/\.0$/, '') : '0';
  const remaining = Math.max(0, yb.target - progress.yearBooksDone);
  const perDay = Math.round(wt.target / 7);
  const weekPct = wt.target > 0 ? Math.round((progress.weekMinutesDone / wt.target) * 100) : 0;

  const disableAll = (): void =>
    setDraft((d) => ({
      yearlyBooks: { ...d.yearlyBooks, enabled: false },
      weeklyMinutes: { ...d.weeklyMinutes, enabled: false },
      streakDays: { ...d.streakDays, enabled: false },
    }));

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await fetch('/api/reader/goals', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          yearlyBooks: yb.enabled ? yb.target : null,
          weeklyMinutes: wt.enabled ? wt.target : null,
          streakDays: st.enabled ? st.target : null,
        }),
      });
      router.refresh();
      onOpenChange(false);
    } catch {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[100%] gap-0 overflow-hidden rounded-[18px] border-border bg-background p-0">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-border px-[22px] pb-4 pt-5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-[10px] border text-primary"
            style={{
              background: 'color-mix(in srgb, var(--color-primary) 16%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-primary) 38%, transparent)',
            }}
          >
            <Target className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="font-display text-[19px] font-semibold tracking-[-0.02em]">
              {anyOn ? 'Edit reading goals' : 'Set a reading goal'}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
              Targets are yours alone — progress updates as you read.
            </DialogDescription>
          </div>
        </div>

        {/* body */}
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-[18px]">
          <GoalEditor
            icon={Book}
            accentVar="--color-primary"
            title="Yearly books"
            on={yb.enabled}
            onToggle={(v) => upd('yearlyBooks', { enabled: v })}
            focused={focus === 'yearlyBooks'}
          >
            <Stepper
              value={yb.target}
              onChange={(v) => upd('yearlyBooks', { target: v })}
              step={1}
              min={1}
              max={365}
              fmt={(v) => `${v} books`}
              disabled={!yb.enabled}
            />
            <div className="my-3.5">
              <Slider
                value={yb.target}
                min={6}
                max={150}
                step={1}
                onChange={(v) => upd('yearlyBooks', { target: v })}
                disabled={!yb.enabled}
                accentVar="--color-primary"
              />
            </div>
            <Chips
              options={[12, 24, 52, 75, 104]}
              value={yb.target}
              onChange={(v) => upd('yearlyBooks', { target: v })}
              disabled={!yb.enabled}
              fmt={(v) => String(v)}
            />
            <PaceNote>
              ≈ {perMonth}/month · you&apos;re at {progress.yearBooksDone}, {remaining} to go in{' '}
              {monthsLeft} mo
            </PaceNote>
          </GoalEditor>

          <GoalEditor
            icon={Clock}
            accentVar="--color-ok"
            title="Weekly reading time"
            on={wt.enabled}
            onToggle={(v) => upd('weeklyMinutes', { enabled: v })}
            focused={focus === 'weeklyMinutes'}
          >
            <Stepper
              value={wt.target}
              onChange={(v) => upd('weeklyMinutes', { target: v })}
              step={30}
              min={30}
              max={3360}
              fmt={(v) => fmtMins(v).v}
              disabled={!wt.enabled}
            />
            <div className="my-3.5">
              <Slider
                value={wt.target}
                min={60}
                max={2100}
                step={30}
                onChange={(v) => upd('weeklyMinutes', { target: v })}
                disabled={!wt.enabled}
                accentVar="--color-ok"
              />
            </div>
            <Chips
              options={[180, 300, 600, 900, 1200]}
              value={wt.target}
              onChange={(v) => upd('weeklyMinutes', { target: v })}
              disabled={!wt.enabled}
              fmt={(v) => fmtMins(v).v}
            />
            <PaceNote>
              ≈ {fmtMins(perDay).v}/day · {weekPct}% of this week done
            </PaceNote>
          </GoalEditor>

          <GoalEditor
            icon={Flame}
            accentVar="--color-warn"
            title="Reading streak"
            on={st.enabled}
            onToggle={(v) => upd('streakDays', { enabled: v })}
            focused={focus === 'streakDays'}
          >
            <Stepper
              value={st.target}
              onChange={(v) => upd('streakDays', { target: v })}
              step={1}
              min={2}
              max={365}
              fmt={(v) => `${v} days`}
              disabled={!st.enabled}
            />
            <div className="my-3.5">
              <Slider
                value={st.target}
                min={3}
                max={200}
                step={1}
                onChange={(v) => upd('streakDays', { target: v })}
                disabled={!st.enabled}
                accentVar="--color-warn"
              />
            </div>
            <Chips
              options={[7, 14, 30, 100, 365]}
              value={st.target}
              onChange={(v) => upd('streakDays', { target: v })}
              disabled={!st.enabled}
              fmt={(v) => `${v}d`}
            />
            <PaceNote>Current {progress.streakDays} days</PaceNote>
          </GoalEditor>
        </div>

        {/* footer */}
        <div className="flex items-center gap-3 border-t border-border px-[22px] py-3.5">
          <button
            type="button"
            onClick={disableAll}
            disabled={!anyOn}
            className="text-[12.5px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:text-muted-foreground"
          >
            Turn all off
          </button>
          <div className="ml-auto flex gap-[9px]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-[38px] rounded-[9px] border border-border bg-elevated px-4 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="h-[38px] rounded-[9px] bg-primary px-5 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              Save goals
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
