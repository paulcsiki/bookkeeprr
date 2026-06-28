'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-fetch';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: Props): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  async function onConfirm(): Promise<void> {
    if (!password) {
      toast.error('Password is required to confirm deletion');
      return;
    }
    setPending(true);
    try {
      const r = await apiFetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: password }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string };
        toast.error(body.message ?? 'Could not delete account');
        return;
      }
      // Success — redirect to login.
      window.location.href = '/login';
    } finally {
      setPending(false);
    }
  }

  function handleOpenChange(next: boolean): void {
    if (!pending) {
      setPassword('');
      onOpenChange(next);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-[var(--color-err)]">Delete account</DialogTitle>
          <DialogDescription>
            This action is permanent. All your data — sessions, reading progress, and settings —
            will be deleted immediately. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <Field label="Confirm your password" htmlFor="delete-confirm-password" required>
          <Input
            id="delete-confirm-password"
            type="password"
            placeholder="Enter your current password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={pending}
          />
        </Field>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() => void onConfirm()}
            disabled={!password}
          >
            Delete my account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
