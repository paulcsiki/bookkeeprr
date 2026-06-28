'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowUp, Check } from 'lucide-react';
import { Field, ObInput, ObBtn } from '../primitives';
import { analyzePw } from '../pw-score';

type Props = { onNext: (username: string) => void; onBack: () => void };

export function AdminStep({ onNext, onBack }: Props): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pw = analyzePw(password);

  async function submit(): Promise<void> {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setPending(true);
    try {
      const r = await fetch('/api/auth/register-first-admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `HTTP ${r.status}`);
        return;
      }
      onNext(email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ob-enter">
      <div className="ob-eyebrow">STEP 1 · ADMIN ACCOUNT</div>
      <h2 className="ob-h2">Create the owner account</h2>
      <p className="ob-sub">
        The first admin. You&apos;ll sign in with this email; it can invite others from Settings → Users.
      </p>

      {error && <div className="ob-alert"><AlertTriangle size={14} /> {error}</div>}

      <Field label="Email" htmlFor="admin-email">
        <ObInput id="admin-email" value={email} onChange={setEmail} type="email" inputMode="email"
          placeholder="you@example.com" autoComplete="username" autoFocus />
      </Field>

      <Field
        label="Password"
        htmlFor="admin-password"
        right={<button type="button" className="ob-link-btn" onClick={() => setShowPw((v) => !v)}>{showPw ? 'Hide' : 'Show'}</button>}
      >
        <ObInput
          id="admin-password"
          value={password}
          onChange={setPassword}
          type={showPw ? 'text' : 'password'}
          placeholder="••••••••"
          autoComplete="new-password"
        />
        <div className="ob-pw">
          <div className="ob-pw-track">
            {[0, 1, 2].map((i) => (
              <span key={i} className="ob-pw-seg" data-on={i < pw.level ? '1' : '0'} data-lvl={pw.level} />
            ))}
          </div>
          <span className="ob-pw-label" data-lvl={pw.level}>{pw.label || 'Empty'}</span>
        </div>
        <div className="ob-pw-hint" data-strong={pw.strong ? '1' : '0'}>
          {pw.strong ? <Check size={12} strokeWidth={2.4} /> : <ArrowUp size={12} />}
          <span>{pw.hint}</span>
        </div>
      </Field>

      <Field
        label="Confirm password"
        htmlFor="admin-confirm"
        error={confirm.length > 0 && confirm !== password ? 'Doesn’t match yet' : null}
      >
        <ObInput
          id="admin-confirm"
          value={confirm}
          onChange={setConfirm}
          type={showPw ? 'text' : 'password'}
          placeholder="••••••••"
          autoComplete="new-password"
          invalid={confirm.length > 0 && confirm !== password}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        />
      </Field>

      <div className="ob-foot">
        <ObBtn variant="ghost" onClick={onBack}>Back</ObBtn>
        <ObBtn loading={pending} onClick={() => void submit()}>Create admin <ArrowRight size={15} /></ObBtn>
      </div>
    </div>
  );
}
