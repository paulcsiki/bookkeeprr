'use client';

import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
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

// Spec §8.3: this exact string MUST be displayed verbatim in the modal.
export const DISCONNECT_WARNING_TEXT =
  'Disconnecting will permanently delete all data we hold for this installation on the cloud service: registered devices, audit records linked to your installation, and any cached state. This cannot be undone. Future re-registration will create a fresh tenant.';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
};

export function CloudDisconnectModal({ open, onClose, onConfirm }: Props): React.JSX.Element {
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setAcknowledged(false);
      setPending(false);
    }
  }, [open]);

  async function handleSubmit(): Promise<void> {
    if (!acknowledged) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect from cloud</AlertDialogTitle>
          <AlertDialogDescription>{DISCONNECT_WARNING_TEXT}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-3">
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              className="mt-0.5"
            />
            <span>I understand this is permanent and cannot be undone.</span>
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={pending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={!acknowledged || pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'Disconnecting…' : 'Disconnect'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
