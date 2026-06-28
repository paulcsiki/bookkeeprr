'use client';

import { Check } from 'lucide-react';
import { Logo } from '@bookkeeprr/ui';

const STEPS = [
  { label: 'Admin account', sub: 'Owner login' },
  { label: 'Storage paths', sub: 'Config + media' },
  { label: 'Download client', sub: 'qBittorrent' },
  { label: 'Finish', sub: 'Review & launch' },
] as const;

export function StepRail({ idx, goStep, adminExists }: { idx: number; goStep: (i: number) => void; adminExists?: boolean }): React.JSX.Element {
  const last = STEPS.length - 1;
  return (
    <div className="ob-rail">
      <div className="ob-brand"><Logo size={24} /></div>
      <div className="ob-steps" style={{ '--rail-progress': idx / last } as React.CSSProperties}>
        {STEPS.map((s, i) => {
          const state = i < idx ? 'done' : i === idx ? (idx === last ? 'done' : 'current') : 'todo';
          return (
            <button key={s.label} type="button" className="ob-step" data-state={state} disabled={i > idx || (adminExists === true && i === 0)} onClick={() => { if (i <= idx && !(adminExists === true && i === 0)) goStep(i); }}>
              <span className="ob-node">{state === 'done' ? <Check size={13} strokeWidth={2.4} /> : <span className="ob-node-n">{i + 1}</span>}</span>
              <span className="ob-step-text">
                <span className="ob-step-label">{s.label}</span>
                <span className="ob-step-sub">{s.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="ob-rail-foot"><span className="ob-statusdot" /> self-hosted · v0.2.0</div>
    </div>
  );
}
