'use client';

import { useEffect, useReducer } from 'react';

// 8 prototype phases mapped to more granular phase names.
// Prototype PHASES array:
//   idle(1500) → typing(2400) → empty(1700) → dialog(2400)
//   → added(1800) → grabbing(2600) → imported(1600) → detail(3800)
// After detail finishes the replay scrim appears ("complete").
export type Phase =
  | 'idle'
  | 'typing'
  | 'empty'
  | 'dialog'
  | 'added'
  | 'grabbing'
  | 'imported'
  | 'detail'
  | 'complete';

type State = { phase: Phase; started: boolean };
type Action = { type: 'NEXT' } | { type: 'START' } | { type: 'RESET' };

const ORDER: Phase[] = [
  'idle',
  'typing',
  'empty',
  'dialog',
  'added',
  'grabbing',
  'imported',
  'detail',
  'complete',
];

// Durations match the prototype's PHASES[].dur values exactly.
const DURATIONS: Record<Phase, number> = {
  idle: 1500,
  typing: 2400,
  empty: 1700,
  dialog: 2400,
  added: 1800,
  grabbing: 2600,
  imported: 1600,
  detail: 3800,
  complete: Number.POSITIVE_INFINITY, // stays until replay clicked
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    // START kicks off the sequence the first time the demo scrolls into view;
    // ignored once already running so re-entering the viewport doesn't restart it.
    case 'START':
      return state.started ? state : { phase: 'idle', started: true };
    // RESET (the Replay button) always restarts from the top, playing immediately.
    case 'RESET':
      return { phase: 'idle', started: true };
    case 'NEXT': {
      const idx = ORDER.indexOf(state.phase);
      const next = ORDER[Math.min(idx + 1, ORDER.length - 1)] ?? 'complete';
      return { phase: next, started: state.started };
    }
  }
}

export function useDemoMachine(): { phase: Phase; start: () => void; reset: () => void } {
  const [state, dispatch] = useReducer(reducer, { phase: 'idle' as Phase, started: false });

  useEffect(() => {
    // Stay frozen on the idle frame until the demo is started (scrolled into view).
    if (!state.started) return;
    if (state.phase === 'complete') return;
    const duration = DURATIONS[state.phase];
    if (!Number.isFinite(duration)) return;
    const t = setTimeout(() => dispatch({ type: 'NEXT' }), duration);
    return () => clearTimeout(t);
  }, [state.phase, state.started]);

  return {
    phase: state.phase,
    start: () => dispatch({ type: 'START' }),
    reset: () => dispatch({ type: 'RESET' }),
  };
}
