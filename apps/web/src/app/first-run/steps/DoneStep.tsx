'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, User, Folder, Download, Library, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

type Props = { username: string; configPath: string; mediaPath: string; qbtHost: string; qbtPort: number; qbtSaved: boolean };

export function DoneStep({ username, configPath, mediaPath, qbtHost, qbtPort, qbtSaved }: Props): React.JSX.Element {
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/first-run/complete', { method: 'POST' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setCompleted(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const name = username.trim() || 'admin';
  const rows = [
    { ico: <User size={15} />, label: 'Admin account', val: name, tag: 'OWNER' },
    { ico: <Folder size={15} />, label: 'Storage', val: `${configPath} · ${mediaPath}`, tag: 'WRITABLE' },
    { ico: <Download size={15} />, label: 'Download client', val: `${qbtHost}:${qbtPort}`, tag: qbtSaved ? 'CONNECTED' : 'qBITTORRENT' },
  ];

  return (
    <div className="ob-enter ob-done">
      <div className="ob-check-wrap">
        <span className="ob-check-pulse" />
        <span className="ob-check"><Check size={38} strokeWidth={2.6} style={{ color: 'var(--color-primary)' }} /></span>
      </div>
      <div className="ob-eyebrow center">ALL SET</div>
      <h2 className="ob-h2 center">Your reading-room is ready, {name}.</h2>
      <p className="ob-sub center">
        {error ? `Setup saved, but finalizing hit an error: ${error}` : 'Configuration saved. Everything here is editable later from Settings.'}
      </p>

      <div className="ob-summary">
        {rows.map((r) => (
          <div key={r.label} className="ob-sum-row">
            <span className="ob-sum-ico">{r.ico}</span>
            <div className="ob-sum-body">
              <span className="ob-sum-label">{r.label}</span>
              <span className="ob-sum-val mono">{r.val}</span>
            </div>
            <span className="ob-sum-tag">{r.tag}</span>
            <span className="ob-sum-check"><Check size={13} strokeWidth={2.4} /></span>
          </div>
        ))}
      </div>

      <div className="ob-foot done-foot">
        {completed
          ? <Link href="/library" className="ob-btn ob-btn-outline"><Plus size={15} /> Add a series</Link>
          : <span className="ob-btn ob-btn-outline is-disabled" aria-disabled="true"><Plus size={15} /> Add a series</span>}
        {completed
          ? <Link href="/library" className="ob-btn ob-btn-primary"><Library size={15} /> Go to library</Link>
          : <span className="ob-btn ob-btn-primary is-disabled" aria-disabled="true"><Library size={15} /> Go to library</span>}
      </div>
    </div>
  );
}
