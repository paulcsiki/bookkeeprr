'use client';

import { useState } from 'react';
import { Copy, Check, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-fetch';

type SetupData = {
  secret: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
};

type Props = {
  onClose: () => void;
  onEnabled: () => void;
};

export function TotpSetupDialog({ onClose, onEnabled }: Props): React.JSX.Element {
  const [step, setStep] = useState<'loading' | 'scan' | 'verify' | 'codes'>('loading');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Load setup data on mount
  useState(() => {
    apiFetch('/api/auth/me/totp/setup', { method: 'POST' })
      .then((r) => r.json() as Promise<SetupData>)
      .then((data) => {
        setSetupData(data);
        setStep('scan');
      })
      .catch(() => setError('Could not initialize 2FA setup. Please try again.'));
  });

  function copyToClipboard(text: string, which: 'secret' | 'codes'): void {
    void navigator.clipboard.writeText(text).then(() => {
      if (which === 'secret') {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedCodes(true);
        setTimeout(() => setCopiedCodes(false), 2000);
      }
    });
  }

  async function handleVerify(): Promise<void> {
    if (!setupData) return;
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('Please enter a 6-digit code.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await apiFetch('/api/auth/me/totp/enable', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: setupData.secret, code, recoveryCodes: setupData.recoveryCodes }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? 'Verification failed. Please try again.');
        return;
      }
      setStep('codes');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  function handleDone(): void {
    onEnabled();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border p-5">
          <h3 className="font-display text-base font-semibold text-foreground">
            Set up two-factor authentication
          </h3>
          <div className="mt-1.5 flex gap-2 text-xs text-muted-foreground">
            {(['scan', 'verify', 'codes'] as const).map((s, i) => (
              <span key={s} className="flex items-center gap-1">
                {i > 0 && <span>→</span>}
                <span className={step === s ? 'text-primary font-medium' : ''}>
                  {s === 'scan' ? 'Scan QR' : s === 'verify' ? 'Verify code' : 'Save codes'}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === 'loading' && (
            <p className="text-sm text-muted-foreground">Preparing your authenticator setup…</p>
          )}

          {step === 'scan' && setupData && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Open your authenticator app (e.g. Google Authenticator, Authy, 1Password) and scan
                the QR code below.
              </p>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setupData.qrCodeDataUrl}
                  alt="Authenticator QR code"
                  className="h-44 w-44 rounded-md"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Or enter manually:</p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5">
                  <code className="flex-1 break-all font-mono text-xs text-foreground">
                    {setupData.secret}
                  </code>
                  <button
                    type="button"
                    aria-label="Copy secret"
                    onClick={() => copyToClipboard(setupData.secret, 'secret')}
                    className="shrink-0 rounded p-1.5 hover:bg-muted"
                  >
                    {copiedSecret ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
              {error && <p className="text-xs text-[var(--color-err)]">{error}</p>}
            </div>
          )}

          {step === 'verify' && setupData && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app to confirm the setup.
              </p>
              <Field label="Verification code" htmlFor="totp-code" required>
                <Input
                  id="totp-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleVerify(); }}
                />
              </Field>
              {error && <p className="text-xs text-[var(--color-err)]">{error}</p>}
            </div>
          )}

          {step === 'codes' && setupData && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-md border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/8 p-3 text-sm text-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warn)]" />
                <p>
                  Save these recovery codes somewhere safe. If you lose access to your authenticator
                  app, these are the only way to sign in.
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {setupData.recoveryCodes.map((c) => (
                    <code key={c} className="font-mono text-xs text-foreground">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(setupData.recoveryCodes.join('\n'), 'codes')}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copiedCodes ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedCodes ? 'Copied!' : 'Copy all codes'}
                </button>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                I&apos;ve saved my recovery codes in a safe place
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          {step !== 'codes' && (
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
          )}

          {step === 'scan' && (
            <Button onClick={() => setStep('verify')}>Continue</Button>
          )}

          {step === 'verify' && (
            <>
              <Button variant="outline" onClick={() => { setStep('scan'); setCode(''); setError(null); }} disabled={pending}>
                Back
              </Button>
              <Button onClick={() => void handleVerify()} loading={pending}>
                Verify
              </Button>
            </>
          )}

          {step === 'codes' && (
            <Button onClick={handleDone} disabled={!confirmed}>
              Done — 2FA is on
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
