'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { UserView } from './UsersList';

type Props = {
  target: UserView | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
};

export function ResetPasswordDialog({ target, onClose, onDone }: Props): React.JSX.Element {
  const [newPassword, setNewPassword] = useState('');
  const [pending, setPending] = useState(false);

  async function onConfirm(): Promise<void> {
    if (target === null) return;
    setPending(true);
    try {
      const r = await apiFetch(`/api/users/${target.id}/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword, mustChangePassword: true }),
      });
      if (!r.ok) {
        const body = (await r.json()) as { message: string };
        toast.error(body.message);
        return;
      }
      toast.success('Password reset; user must change on next login');
      setNewPassword('');
      onClose();
      await onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset password for {target?.username}</AlertDialogTitle>
          <AlertDialogDescription>
            Sets a new temporary password and forces the user to change it on next login. Their
            existing sessions are revoked.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-3">
          <Field label="New password" htmlFor="new-pw" required hint="Minimum 8 characters.">
            <Input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending || newPassword.length < 8}>
            {pending ? 'Resetting…' : 'Reset password'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
