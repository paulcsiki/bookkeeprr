'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { Avatar, colorFromSeed } from '@bookkeeprr/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VirtualList } from '@/components/ui/virtual-list';
import { RelativeTime } from '@/components/RelativeTime';
import { toast } from 'sonner';
import { ResetPasswordDialog } from './ResetPasswordDialog';

export type UserView = {
  id: number;
  username: string;
  displayName: string | null;
  /** Custom avatar URL, or null to fall back to Gravatar/initials. */
  avatarUrl: string | null;
  role: 'admin' | 'user';
  mustChangePassword: boolean;
  disabled: boolean;
  authSource: 'local' | 'oidc' | 'forward_auth';
  createdAt: string;
  lastLoginAt: string | null;
};

// design-system .dtable column grid; header + body styled separately.
// Username gets the most room (avatar + display name + secondary username line).
const COLS = 'grid grid-cols-[minmax(12rem,1.4fr)_6rem_6rem_11rem_9rem_minmax(0,1fr)] gap-3';
const HEAD_ROW = `${COLS} items-center bg-elevated px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`;
const BODY_ROW = `${COLS} items-center border-t border-border px-4 py-2 text-[13px] text-foreground/80`;

export function UsersList({
  initial,
  currentUserId,
}: {
  initial: UserView[];
  currentUserId: number;
}): React.JSX.Element {
  const [users, setUsers] = useState<UserView[]>(initial);
  const [resetTarget, setResetTarget] = useState<UserView | null>(null);

  async function refresh(): Promise<void> {
    const r = await apiFetch('/api/users');
    if (r.ok) {
      const body = (await r.json()) as { users: UserView[] };
      setUsers(body.users);
    }
  }

  async function patch(id: number, body: Record<string, unknown>): Promise<void> {
    const r = await apiFetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errBody = (await r.json()) as { message: string };
      toast.error(errBody.message);
      return;
    }
    toast.success('Updated');
    await refresh();
  }

  async function del(id: number, username: string): Promise<void> {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    const r = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      const errBody = (await r.json()) as { message: string };
      toast.error(errBody.message);
      return;
    }
    toast.success('Deleted');
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/settings/users/new">Create user</Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-elevated">
        {/* Column header */}
        <div className={HEAD_ROW}>
          <span>Username</span>
          <span>Source</span>
          <span>Role</span>
          <span>Status</span>
          <span>Last login</span>
          <span className="text-right">Actions</span>
        </div>

        {users.length === 0 ? (
          <div className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
            No users found.
          </div>
        ) : (
          <VirtualList
            items={users}
            estimateSize={() => 56}
            keyExtractor={(u) => u.id}
            // Size to content (no empty box for a handful of users); scroll past 600px.
            className="max-h-[600px]"
            renderItem={(u) => (
              <div className={`${BODY_ROW} min-h-[56px] hover:bg-hover`}>
                <span className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    email={u.username}
                    name={u.displayName ?? u.username}
                    size={28}
                    avatarUrl={u.avatarUrl}
                    variant={colorFromSeed(u.username)}
                    className="shrink-0"
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate font-medium text-foreground">
                      {u.displayName ?? u.username}
                    </span>
                    {u.displayName != null && u.displayName !== u.username && (
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {u.username}
                      </span>
                    )}
                  </span>
                </span>
                <span>
                  <span
                    className={
                      u.authSource === 'oidc'
                        ? 'inline-flex items-center rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs font-mono text-[var(--color-primary)]'
                        : 'inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground'
                    }
                  >
                    {u.authSource === 'oidc' ? 'OIDC' : 'Local'}
                  </span>
                </span>
                <span>
                  <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                </span>
                <span className="space-x-1">
                  {u.disabled && <Badge variant="destructive">disabled</Badge>}
                  {u.mustChangePassword && <Badge variant="outline">must-change-pw</Badge>}
                  {!u.disabled && !u.mustChangePassword && <Badge>active</Badge>}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {u.lastLoginAt != null ? <RelativeTime date={u.lastLoginAt} /> : '—'}
                </span>
                <span className="text-right space-x-1">
                  <Button variant="ghost" size="sm" onClick={() => setResetTarget(u)}>
                    Reset pw
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}
                    disabled={u.id === currentUserId}
                  >
                    Toggle role
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => patch(u.id, { disabled: !u.disabled })}
                    disabled={u.id === currentUserId}
                  >
                    {u.disabled ? 'Enable' : 'Disable'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => del(u.id, u.username)}
                    disabled={u.id === currentUserId}
                  >
                    Delete
                  </Button>
                </span>
              </div>
            )}
          />
        )}
      </div>
      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onDone={refresh}
      />
    </div>
  );
}
