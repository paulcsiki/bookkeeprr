'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Logo } from '@/components/Logo';

type OidcInfo = { enabled: boolean; buttonLabel: string; localDisabled?: boolean };

export function LoginForm({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ next?: string; return_to?: string }>;
}): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [next, setNext] = useState('/');
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [oidc, setOidc] = useState<OidcInfo | null>(null);

  // TOTP challenge state
  const [totpChallenge, setTotpChallenge] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  useEffect(() => {
    searchParamsPromise.then((p) => {
      setNext(p.next ?? '/');
      setReturnTo(p.return_to ?? null);
    });
  }, [searchParamsPromise]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/oidc/info')
      .then((r) => r.json() as Promise<OidcInfo>)
      .then((j) => { if (!cancelled) setOidc(j); })
      .catch(() => { if (!cancelled) setOidc({ enabled: false, buttonLabel: '' }); });
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          ...(returnTo !== null ? { return_to: returnTo } : {}),
        }),
      });
      if (!r.ok) {
        const body = (await r.json()) as { message?: string; error?: string };
        setError(body.message ?? body.error ?? 'Sign-in failed');
        return;
      }
      const body = (await r.json()) as { redirect_to?: string; requiresTotp?: boolean; challengeToken?: string };
      if (body.requiresTotp === true && body.challengeToken) {
        // Enter TOTP challenge step
        setTotpChallenge(body.challengeToken);
        return;
      }
      window.location.href = body.redirect_to ?? next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function onTotpSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!totpChallenge) return;
    setError(null);
    setPending(true);
    try {
      const r = await fetch('/api/auth/login/totp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeToken: totpChallenge,
          code: totpCode,
          ...(returnTo !== null ? { return_to: returnTo } : {}),
        }),
      });
      if (!r.ok) {
        const body = (await r.json()) as { message?: string };
        setError(body.message ?? 'Invalid code. Please try again.');
        return;
      }
      const body = (await r.json()) as { redirect_to?: string };
      window.location.href = body.redirect_to ?? next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  const startOidcParams: string[] = [];
  if (next !== '/') startOidcParams.push(`next=${encodeURIComponent(next)}`);
  if (returnTo !== null) startOidcParams.push(`return_to=${encodeURIComponent(returnTo)}`);
  const startOidcAction =
    startOidcParams.length === 0
      ? '/api/auth/oidc/start'
      : `/api/auth/oidc/start?${startOidcParams.join('&')}`;

  const oidcOnly = oidc?.enabled === true && oidc.localDisabled === true;

  // TOTP challenge view
  if (totpChallenge !== null) {
    return (
      <div className="login-card">
        <div className="brand flex items-center gap-2.5">
          <Logo size={30} markOnly />
          <span className="font-display text-[21px] font-semibold leading-none">
            bookkeep<span className="text-primary">rr</span>
          </span>
        </div>
        <div className="mt-[26px] flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-display text-[25px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
            Two-factor check
          </h3>
        </div>
        <p className="mt-1.5 mb-[26px] text-[13.5px] leading-[1.5] text-muted-foreground">
          {useRecovery
            ? 'Enter one of your recovery codes to continue.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
        <form onSubmit={(e) => void onTotpSubmit(e)} className="space-y-3.5">
          {error !== null && (
            <p className="text-xs text-[var(--color-err)]" role="alert">{error}</p>
          )}
          <Field label={useRecovery ? 'Recovery code' : 'Authentication code'} htmlFor="totp-code" required>
            <Input
              id="totp-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder={useRecovery ? 'XXXX-XXXX-XXXX' : '000000'}
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete={useRecovery ? 'off' : 'one-time-code'}
              autoFocus
              required
            />
          </Field>
          <Button type="submit" loading={pending} className="h-11 w-full">
            Verify
          </Button>
        </form>
        <div className="login-foot">
          <button
            type="button"
            onClick={() => { setUseRecovery((v) => !v); setTotpCode(''); setError(null); }}
            className="text-primary hover:underline"
          >
            {useRecovery ? 'Use authenticator code instead' : 'Use a recovery code instead'}
          </button>
        </div>
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={() => { setTotpChallenge(null); setTotpCode(''); setError(null); setUseRecovery(false); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to sign-in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="brand flex items-center gap-2.5">
        <Logo size={30} markOnly />
        <span className="font-display text-[21px] font-semibold leading-none">
          bookkeep<span className="text-primary">rr</span>
        </span>
      </div>
      <h3 className="mt-[26px] font-display text-[25px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
        Welcome back
      </h3>
      <p className="mt-1.5 mb-[26px] text-[13.5px] leading-[1.5] text-muted-foreground">
        Sign in to your reading-room.
      </p>

      {!oidcOnly && (
        <form onSubmit={onSubmit} className="space-y-3.5">
          {error !== null && (
            <p className="text-xs text-[var(--color-err)]" role="alert">
              {error}
            </p>
          )}
          <Field label="Username or email" htmlFor="username" required>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
            />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </Field>

          <div className="flex items-center justify-between py-1">
            <label className="flex items-center gap-2 text-[12.5px] text-foreground/85">
              <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
              Keep me signed in
            </label>
          </div>

          <Button type="submit" loading={pending} className="h-11 w-full">
            Sign in
          </Button>
        </form>
      )}

      {oidc?.enabled && (
        <>
          {!oidcOnly && (
            <div className="login-or">
              <span>or</span>
            </div>
          )}
          <form action={startOidcAction} method="POST">
            <button type="submit" className="oidc-btn">
              <span className="mk">{(oidc.buttonLabel || 'O').slice(0, 1).toUpperCase()}</span>
              {oidc.buttonLabel || 'Continue with OIDC'}
            </button>
          </form>
        </>
      )}

      {!oidcOnly && (
        <div className="login-foot">
          New here? Ask an admin for an invite.
        </div>
      )}
    </div>
  );
}
