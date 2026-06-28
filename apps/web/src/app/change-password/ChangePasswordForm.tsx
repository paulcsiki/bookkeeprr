'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';

export function ChangePasswordForm(): React.JSX.Element {
  const [forced, setForced] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch('/api/auth/me')
      .then((r) => r.json())
      .then((body: { user: { mustChangePassword: boolean } | null }) =>
        setForced(body.user?.mustChangePassword ?? false),
      );
  }, []);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setPending(true);
    try {
      const body: Record<string, unknown> = { newPassword };
      if (forced === false) body.currentPassword = currentPassword;
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const rj = (await r.json()) as { message: string };
        setError(rj.message);
        return;
      }
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  if (forced === null) {
    return <div className="text-sm text-muted-foreground text-center">Loading…</div>;
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        {error !== null && (
          <div className="text-xs text-[var(--color-err)]" role="alert">
            {error}
          </div>
        )}
        {forced && (
          <div className="text-xs text-muted-foreground">
            An admin reset your password. Set a new password to continue.
          </div>
        )}
        {!forced && (
          <Field label="Current password" htmlFor="current" required>
            <Input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
        )}
        <Field label="New password" htmlFor="new" required hint="Minimum 8 characters.">
          <Input
            id="new"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" required>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </Card>
  );
}
