'use client';

import { Activity, Settings, ArrowRight } from 'lucide-react';
import { Logo } from '@bookkeeprr/ui';
import { ObBtn } from '../primitives';

export function WelcomeStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  return (
    <div className="ob-enter ob-welcome">
      <div className="ob-brand-lg">
        <Logo size={40} />
      </div>
      <div className="ob-eyebrow">FIRST-RUN SETUP</div>
      <h1 className="ob-h1">Let&apos;s stand up your reading-room.</h1>
      <p className="ob-lede">
        Four quick steps: create your admin account, point bookkeeprr at your storage, connect your
        download client, then review &amp; launch. Everything is editable later from Settings.
      </p>
      <div className="ob-meta-chips">
        <span className="ob-chip"><Activity size={12.5} /> ≈ 2 minutes</span>
        <span className="ob-chip"><span className="ob-chip-n">4</span> steps</span>
        <span className="ob-chip"><Settings size={12.5} /> Editable later</span>
      </div>
      <ObBtn full onClick={onNext}>Begin setup <ArrowRight size={15} /></ObBtn>
      <div className="ob-welcome-foot">
        Prefer the CLI? See <span className="mono">docs/first-run.md</span> in the repo.
      </div>
    </div>
  );
}
