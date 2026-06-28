'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-fetch';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';

export function CreateUserForm(): React.JSX.Element {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [forceChange, setForceChange] = useState(true);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    try {
      const r = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, role, mustChangePassword: forceChange }),
      });
      if (!r.ok) {
        const body = (await r.json()) as { message: string };
        toast.error(body.message);
        return;
      }
      toast.success('User created');
      // /settings/users is force-dynamic: navigating there re-runs the server
      // page (listUsers → fresh UsersList seed), so the new user shows on
      // return without an explicit router.refresh().
      router.push('/settings/users');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create user"
        actions={
          <Button variant="ghost" onClick={() => router.push('/settings/users')}>
            ← Back to users
          </Button>
        }
      />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Username" htmlFor="create-username" required>
          <Input
            id="create-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Initial password"
          htmlFor="create-password"
          required
          hint="At least 8 characters. The user can change it on first login."
        >
          <Input
            id="create-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        <Field label="Role" required>
          <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'user')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={forceChange} onCheckedChange={(v) => setForceChange(v === true)} />
          Force password change on first login
        </label>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Creating…' : 'Create'}
        </Button>
      </form>
    </div>
  );
}
