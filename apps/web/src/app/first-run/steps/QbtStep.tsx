'use client';

import { useState } from 'react';
import { Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { Field, ObInput, ObBtn, Toggle } from '../primitives';

export type QbtInitial = { host: string; port: number; username: string; password: string; useHttps: boolean };
type Props = { initial: QbtInitial; onNext: () => void; onBack: () => void };
type TestState = 'idle' | 'testing' | 'ok' | 'err';

export function QbtStep({ initial, onNext, onBack }: Props): React.JSX.Element {
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState('');
  const [useHttps, setUseHttps] = useState(initial.useHttps);
  const [saved, setSaved] = useState(initial.host.length > 0 && initial.username.length > 0);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');

  function dirty(): void { setSaved(false); setTest('idle'); }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const r = await apiFetch('/api/settings/qbt', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host, port: parseInt(port || '0', 10), username, password, useHttps }),
      });
      if (!r.ok) { const b = (await r.json().catch(() => ({}))) as { error?: string }; setTest('err'); setTestMsg(b.error ?? `HTTP ${r.status}`); return; }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function runTest(): Promise<void> {
    if (!password) { setTest('err'); setTestMsg('Enter a password to test.'); return; }
    setTest('testing'); setTestMsg('');
    try {
      const r = await apiFetch('/api/qbt/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host, port: parseInt(port || '0', 10), username, password, useHttps }),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setTest('err'); setTestMsg(b.error ?? `HTTP ${r.status}`); return; }
      setTest('ok'); setTestMsg(`Reached ${host}:${port}`);
    } catch (e) {
      setTest('err'); setTestMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="ob-enter">
      <div className="ob-eyebrow">STEP 3 · DOWNLOAD CLIENT</div>
      <h2 className="ob-h2">Connect qBittorrent</h2>
      <p className="ob-sub">
        bookkeeprr hands grabs to your existing qBittorrent. Testing is encouraged but optional — a
        temporarily-offline client won&apos;t block setup.
      </p>

      <div className="ob-grid2">
        <Field label="Host" htmlFor="host">
          <ObInput id="host" value={host} onChange={(v) => { setHost(v); dirty(); }} placeholder="qbt.local" mono />
        </Field>
        <Field label="Port" htmlFor="port">
          <ObInput id="port" value={port} onChange={(v) => { setPort(v.replace(/\D/g, '').slice(0, 5)); dirty(); }} inputMode="numeric" mono />
        </Field>
      </div>

      <Field label="Username" htmlFor="username">
        <ObInput id="username" value={username} onChange={(v) => { setUsername(v); dirty(); }} placeholder="admin" mono />
      </Field>
      <Field label="Password" htmlFor="password">
        <ObInput id="password" value={password} onChange={(v) => { setPassword(v); dirty(); }} type="password" placeholder={initial.password ? 'unchanged (leave blank to keep)' : 'enter password'} />
      </Field>

      <div className="ob-switch-row">
        <Toggle on={useHttps} onChange={(v) => { setUseHttps(v); dirty(); }} />
        <span className="ob-switch-lbl">Use HTTPS</span>
        <span className="ob-switch-url mono">{useHttps ? 'https' : 'http'}://{host}:{port}</span>
      </div>

      {test !== 'idle' && (
        <div className={`ob-conn-status ${test}`}>
          {test === 'testing' && <><span className="ob-spin dark" /> Testing connection…</>}
          {test === 'ok' && <><Check size={13} strokeWidth={2.2} /> Connection OK — {testMsg}</>}
          {test === 'err' && <><AlertTriangle size={13} strokeWidth={2} /> {testMsg}</>}
        </div>
      )}
      {saved && test !== 'ok' && (
        <div className="ob-saved-note"><Check size={12.5} strokeWidth={2.2} /> Settings saved</div>
      )}

      <div className="ob-foot wide">
        <ObBtn variant="ghost" onClick={onBack}>Back</ObBtn>
        <div className="ob-foot-grp">
          <ObBtn variant="outline" size="sm" loading={test === 'testing'} onClick={() => void runTest()}>Test</ObBtn>
          <ObBtn variant="outline" size="sm" loading={saving} onClick={() => void save()}>{saved ? 'Saved' : 'Save'}</ObBtn>
          <ObBtn size="sm" disabled={!saved} onClick={onNext}>Next <ArrowRight size={15} /></ObBtn>
        </div>
      </div>
    </div>
  );
}
