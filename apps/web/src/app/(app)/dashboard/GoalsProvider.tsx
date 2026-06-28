'use client';

import * as React from 'react';
import { Target, Pencil } from 'lucide-react';
import { GoalDialog, type GoalsProgress, type GoalFocusKey } from './GoalDialog';
import type { ReadingGoals } from '@/server/db/reading-goals';

type OpenGoals = (focus?: GoalFocusKey) => void;

const OpenContext = React.createContext<OpenGoals>(() => {});

/** Open the reading-goals dialog from anywhere in the dashboard tree. */
export function useOpenGoals(): OpenGoals {
  return React.useContext(OpenContext);
}

/**
 * Client island that owns the single reading-goals dialog instance and exposes
 * an `open(focus?)` to its descendants via context. Wraps the dashboard body so
 * both the widget's empty-state CTA and its "Edit" affordance can open the same
 * dialog. `goals`/`progress` are the server-rendered values; after a save the
 * dialog calls `router.refresh()`, which re-renders this island with fresh props.
 */
export function GoalsProvider({
  goals,
  progress,
  children,
}: {
  goals: ReadingGoals;
  progress: GoalsProgress;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [focus, setFocus] = React.useState<GoalFocusKey>(null);

  const openGoals = React.useCallback<OpenGoals>((f = null) => {
    setFocus(f);
    setOpen(true);
  }, []);

  return (
    <OpenContext.Provider value={openGoals}>
      {children}
      <GoalDialog
        open={open}
        onOpenChange={setOpen}
        goals={goals}
        progress={progress}
        focus={focus}
      />
    </OpenContext.Provider>
  );
}

/** The reading-goals empty-state CTA — opens the dialog. */
export function OpenGoalsButton(): React.JSX.Element {
  const open = useOpenGoals();
  return (
    <button
      type="button"
      onClick={() => open()}
      className="mt-4 inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-primary px-[18px] text-[13px] font-semibold text-primary-foreground"
    >
      <Target className="size-[15px]" aria-hidden /> Set a goal
    </button>
  );
}

/** A small "Edit goals" affordance for the populated widget's header. */
export function EditGoalsButton(): React.JSX.Element {
  const open = useOpenGoals();
  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label="Edit reading goals"
      className="grid size-7 place-items-center rounded-lg border border-border bg-elevated text-muted-foreground transition-colors hover:text-foreground"
    >
      <Pencil className="size-[13px]" aria-hidden />
    </button>
  );
}
