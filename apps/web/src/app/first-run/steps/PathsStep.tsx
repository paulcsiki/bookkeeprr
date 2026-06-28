'use client';

import { useState } from 'react';
import { Check, AlertTriangle, RefreshCw, Settings, Folder, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { ObBtn, ObInput } from '../primitives';
import type { FirstRunPaths, PathStatus } from '@/server/first-run/paths';

function StatusBadge({ status }: { status: PathStatus }): React.JSX.Element {
  if (status === 'writable') return <span className="ob-badge ok"><Check size={12} strokeWidth={2.2} /> Writable</span>;
  if (status === 'missing') return <span className="ob-badge err"><AlertTriangle size={11.5} strokeWidth={2} /> Missing</span>;
  return <span className="ob-badge err"><AlertTriangle size={11.5} strokeWidth={2} /> Not writable</span>;
}

function PathRow({ icon, path, env, desc, status }: { icon: 'settings' | 'folder'; path: string; env: string; desc: string; status: PathStatus }): React.JSX.Element {
  return (
    <div className="ob-path" data-bad={status !== 'writable' ? '1' : '0'}>
      <div className="ob-path-ico">{icon === 'settings' ? <Settings size={16} /> : <Folder size={16} />}</div>
      <div className="ob-path-body">
        <code className="ob-path-code">{path}</code>
        <div className="ob-path-descrow">
          <span className="ob-path-desc">{desc}</span>
          <StatusBadge status={status} />
        </div>
        <div className="ob-env">env: {env}</div>
      </div>
    </div>
  );
}

type Props = { initial: FirstRunPaths; onNext: () => void; onBack: () => void };

export function PathsStep({ initial, onNext, onBack }: Props): React.JSX.Element {
  const [paths, setPaths] = useState<FirstRunPaths>(initial);
  const [mediaInput, setMediaInput] = useState(initial.mediaRoot.path);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const mediaEditable = !initial.mediaEnvSet;
  const bothOk = paths.configDir.status === 'writable' && paths.mediaRoot.status === 'writable';

  async function recheck(): Promise<void> {
    setChecking(true);
    try {
      const q = mediaEditable ? `?mediaRoot=${encodeURIComponent(mediaInput)}` : '';
      const r = await apiFetch(`/api/first-run/check-paths${q}`);
      if (r.ok) setPaths((await r.json()) as FirstRunPaths);
    } finally {
      setChecking(false);
    }
  }

  async function persistAndNext(): Promise<void> {
    if (mediaEditable) {
      setSaving(true);
      try {
        const r = await apiFetch('/api/first-run/media-root', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: mediaInput }),
        });
        if (!r.ok) { const b = (await r.json().catch(() => ({}))) as { status?: PathStatus }; setPaths((p) => ({ ...p, mediaRoot: { path: mediaInput, status: b.status ?? 'not-writable' } })); return; }
      } finally { setSaving(false); }
    }
    onNext();
  }

  return (
    <div className="ob-enter">
      <div className="ob-eyebrow">STEP 2 · STORAGE</div>
      <h2 className="ob-h2">Confirm your storage paths</h2>
      <p className="ob-sub">
        {bothOk
          ? <>Library writes land under <code className="ob-inline">{paths.mediaRoot.path}/comics/</code>. These paths are configurable later in Settings.</>
          : <>bookkeeprr needs read + write access to both directories. {mediaEditable ? 'Enter a writable library path, then re-check.' : 'Fix the bind-mount or permissions, then re-check.'}</>}
      </p>

      <div className="ob-paths">
        <PathRow icon="settings" path={paths.configDir.path} env="BOOKKEEPRR_CONFIG_DIR" desc="DB + backups + logs." status={paths.configDir.status} />
        {mediaEditable ? (
          <div className="ob-path" data-bad={paths.mediaRoot.status !== 'writable' ? '1' : '0'}>
            <div className="ob-path-ico"><Folder size={16} /></div>
            <div className="ob-path-body">
              <ObInput id="media-root" value={mediaInput} mono onChange={(v) => setMediaInput(v)} placeholder="/media" />
              <div className="ob-path-descrow">
                <span className="ob-path-desc">Library writes go under {mediaInput || '/media'}/comics/.</span>
                <StatusBadge status={paths.mediaRoot.status} />
              </div>
              <div className="ob-env">env: BOOKKEEPRR_MEDIA_ROOT (unset — editable)</div>
            </div>
          </div>
        ) : (
          <PathRow icon="folder" path={paths.mediaRoot.path} env="BOOKKEEPRR_MEDIA_ROOT" desc={`Library writes go under ${paths.mediaRoot.path}/comics/.`} status={paths.mediaRoot.status} />
        )}
      </div>

      <button type="button" className="ob-recheck" onClick={() => void recheck()} disabled={checking}>
        <span className={checking ? 'ob-spin-ico spinning' : 'ob-spin-ico'}><RefreshCw size={13} /></span>
        {checking ? 'Re-checking…' : 'Re-check paths'}
      </button>

      <div className="ob-foot">
        <ObBtn variant="ghost" onClick={onBack}>Back</ObBtn>
        <ObBtn disabled={!bothOk} loading={saving} onClick={() => void persistAndNext()}>Continue <ArrowRight size={15} /></ObBtn>
      </div>
    </div>
  );
}
