'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-fetch';

export function SecuritySection(): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast.error('New passwords do not match');
      return;
    }
    setPending(true);
    try {
      const r = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        toast.error(body.message ?? 'Could not change password');
        return;
      }
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Current password" htmlFor="current-password" required>
          <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="New password" htmlFor="new-password" required>
          <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password" required>
          <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Button type="submit" loading={pending}>Change password</Button>
      </form>
  );
}
