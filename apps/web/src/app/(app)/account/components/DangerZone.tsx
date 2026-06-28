'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { apiFetch } from '@/lib/api-fetch';

export function DangerZone(): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function signOutAll(): Promise<void> {
    setPending(true);
    try {
      const r = await apiFetch('/api/auth/logout/all', { method: 'POST' });
      if (!r.ok) {
        toast.error('Could not sign out all sessions');
        return;
      }
      window.location.href = '/login';
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-[var(--color-err)]/40 divide-y divide-[var(--color-err)]/20">
        <div className="flex items-center justify-between gap-6 p-5">
          <div>
            <div className="text-sm font-medium text-foreground">Sign out everywhere</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Ends every session including this one. You&apos;ll need to sign back in.
            </div>
          </div>
          <Button variant="outline" loading={pending} onClick={() => void signOutAll()}>
            Sign out all
          </Button>
        </div>

        <div className="flex items-center justify-between gap-6 p-5">
          <div>
            <div className="text-sm font-medium text-[var(--color-err)]">Delete account</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Permanently deletes your account, sessions, and all personal data. This cannot be undone.
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete account
          </Button>
        </div>
      </div>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
