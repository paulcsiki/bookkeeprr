'use client';

import { useState } from 'react';
import { CoverWall } from '@bookkeeprr/ui';
import { QueryProvider } from '@/components/QueryProvider';
import type { FirstRunPaths } from '@/server/first-run/paths';
import { StepRail } from './StepRail';
import { WelcomeStep } from './steps/WelcomeStep';
import { AdminStep } from './steps/AdminStep';
import { PathsStep } from './steps/PathsStep';
import { QbtStep, type QbtInitial } from './steps/QbtStep';
import { DoneStep } from './steps/DoneStep';

type Screen = 'welcome' | 0 | 1 | 2 | 3;
type Props = { adminExists: boolean; paths: FirstRunPaths; qbtInitial: QbtInitial };

export function OnboardingStage({ adminExists, paths, qbtInitial }: Props): React.JSX.Element {
  // If an admin already exists (reload mid-wizard), skip Welcome + Admin → Storage.
  const [screen, setScreen] = useState<Screen>(adminExists ? 1 : 'welcome');
  const [adminName, setAdminName] = useState('');
  const [qbtSaved, setQbtSaved] = useState(qbtInitial.host.length > 0 && qbtInitial.username.length > 0);
  const isWelcome = screen === 'welcome';
  const idx = isWelcome ? 0 : screen;

  let panel: React.ReactNode;
  if (isWelcome) panel = <WelcomeStep onNext={() => setScreen(0)} />;
  else if (screen === 0) panel = (
    <AdminStep
      onNext={(u) => { setAdminName(u); setScreen(1); }}
      onBack={() => setScreen('welcome')}
    />
  );
  else if (screen === 1) panel = <PathsStep initial={paths} onNext={() => setScreen(2)} onBack={() => setScreen(adminExists ? 1 : 0)} />;
  else if (screen === 2) panel = <QbtStep initial={qbtInitial} onNext={() => { setQbtSaved(true); setScreen(3); }} onBack={() => setScreen(1)} />;
  else panel = (
    <DoneStep
      username={adminName || (adminExists ? 'admin' : '')}
      configPath={paths.configDir.path}
      mediaPath={paths.mediaRoot.path}
      qbtHost={qbtInitial.host || 'qbt.local'}
      qbtPort={qbtInitial.port}
      qbtSaved={qbtSaved}
    />
  );

  return (
    <QueryProvider>
      <div className="ob-stage">
        <div className="ob-wall"><CoverWall cols={12} perCol={10} responsive /></div>
        <div className="ob-scrim" />
        <div className="ob-dim" />
        <div className="ob-vignette" />
        <div className="ob-content">
          <div className={'ob-card' + (isWelcome ? ' welcome' : '')} key={isWelcome ? 'w' : 'wiz'}>
            {!isWelcome && <StepRail idx={idx} goStep={(i) => setScreen(i as Screen)} adminExists={adminExists} />}
            <div className="ob-panel">
              <div className="ob-panel-inner" key={String(screen)}>{panel}</div>
            </div>
          </div>
        </div>
      </div>
    </QueryProvider>
  );
}
