'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, ShieldOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-fetch';
import { TotpSetupDialog } from './TotpSetupDialog';

type Me = {
  id: number;
  username: string;
  authSource?: string;
  totpEnabledAt?: string | number | null;
};

export function TotpSection(): React.JSX.Element {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [password, setPassword] = useState('');
  const [disablePending, setDisablePending] = useState(false);
  const [regenPending, setRegenPending] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then((r) => r.json() as Promise<{ user: Me | null }>)
      .then((j) => setMe(j.user))
      .catch(() => setMe(null));
  }, []);

  async function handleDisable(): Promise<void> {
    setDisablePending(true);
    try {
      const r = await apiFetch('/api/auth/me/totp', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        toast.error(body.message ?? 'Could not disable 2FA');
        return;
      }
      toast.success('Two-factor authentication disabled');
      setMe((prev) => (prev ? { ...prev, totpEnabledAt: null } : prev));
      setShowDisable(false);
      setPassword('');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setDisablePending(false);
    }
  }

  async function handleRegenerate(): Promise<void> {
    setRegenPending(true);
    try {
      const r = await apiFetch('/api/auth/me/totp/recovery-codes/regenerate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        toast.error(body.message ?? 'Could not regenerate codes');
        return;
      }
      const body = (await r.json()) as { recoveryCodes: string[] };
      setNewCodes(body.recoveryCodes);
      setPassword('');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setRegenPending(false);
    }
  }

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // OIDC / forward-auth users cannot use TOTP (no local password to confirm against on disable)
  const isOidc = me?.authSource && me.authSource !== 'local';

  const totpEnabled = me?.totpEnabledAt != null;
  const enabledDate =
    totpEnabled && me?.totpEnabledAt
      ? new Date(me.totpEnabledAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null;

  return (
    <>
      {isOidc ? (
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Two-factor authentication is not available for accounts authenticated via an external
          provider (OIDC / forward auth).
        </div>
      ) : totpEnabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-md border border-[var(--color-ok)]/40 bg-[var(--color-ok)]/8 p-3 text-sm">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-ok)]" />
            <span className="text-foreground">
              Two-factor authentication is enabled
              {enabledDate && (
                <span className="ml-1 text-muted-foreground">since {enabledDate}</span>
              )}
              .
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowRegenerate(true);
                setPassword('');
                setNewCodes(null);
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Regenerate recovery codes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowDisable(true);
                setPassword('');
              }}
              className="text-[var(--color-err)] hover:border-[var(--color-err)]/40 hover:bg-[var(--color-err)]/8"
            >
              <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
              Disable 2FA
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            <ShieldOff className="h-4 w-4 shrink-0" />
            <span>Two-factor authentication is not enabled.</span>
          </div>
          <Button size="sm" onClick={() => setShowSetup(true)}>
            Set up two-factor authentication
          </Button>
        </div>
      )}

      {/* Setup dialog */}
      {showSetup && (
        <TotpSetupDialog
          onClose={() => setShowSetup(false)}
          onEnabled={() => {
            setMe((prev) => (prev ? { ...prev, totpEnabledAt: Date.now() } : prev));
          }}
        />
      )}

      {/* Disable dialog */}
      {showDisable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setShowDisable(false);
            setPassword('');
          }}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border p-5">
              <h3 className="font-display text-base font-semibold text-foreground">Disable 2FA</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Confirm your password to disable two-factor authentication.
              </p>
            </div>
            <div className="p-5">
              <Field label="Current password" htmlFor="disable-totp-pw" required>
                <Input
                  id="disable-totp-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleDisable();
                  }}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDisable(false);
                  setPassword('');
                }}
                disabled={disablePending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleDisable()}
                loading={disablePending}
                disabled={!password}
                className="bg-[var(--color-err)] hover:bg-[var(--color-err)]/90 text-white"
              >
                Disable 2FA
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate codes dialog */}
      {showRegenerate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setShowRegenerate(false);
            setPassword('');
            setNewCodes(null);
          }}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border p-5">
              <h3 className="font-display text-base font-semibold text-foreground">
                Regenerate recovery codes
              </h3>
            </div>
            <div className="p-5 space-y-4">
              {newCodes ? (
                <>
                  <p className="text-sm text-[var(--color-warn)]">
                    Save these codes now — old codes are no longer valid.
                  </p>
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      {newCodes.map((c) => (
                        <code key={c} className="font-mono text-xs text-foreground">
                          {c}
                        </code>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    This will invalidate your existing recovery codes. Confirm with your password.
                  </p>
                  <Field label="Current password" htmlFor="regen-totp-pw" required>
                    <Input
                      id="regen-totp-pw"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRegenerate();
                      }}
                    />
                  </Field>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              {newCodes ? (
                <Button
                  onClick={() => {
                    setShowRegenerate(false);
                    setNewCodes(null);
                  }}
                >
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRegenerate(false);
                      setPassword('');
                    }}
                    disabled={regenPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void handleRegenerate()}
                    loading={regenPending}
                    disabled={!password}
                  >
                    Regenerate
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
