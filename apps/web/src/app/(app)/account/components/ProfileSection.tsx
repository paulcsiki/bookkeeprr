'use client';

import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Avatar, colorFromSeed } from '@bookkeeprr/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-fetch';

type Me = { id: number; username: string; email?: string | null; displayName?: string | null; role: 'admin' | 'user'; avatarUrl?: string | null; authSource?: string };

export function ProfileSection({ me, onAvatarChange }: { me: Me; onAvatarChange?: (avatarUrl: string | null) => void }): React.JSX.Element {
  const initialName = me.displayName ?? '';
  const initialEmail = me.email ?? '';
  const [displayName, setDisplayName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = displayName !== initialName || email !== initialEmail;
  const shownName = displayName.trim() || me.username;
  const shownEmail = email.trim() || `${me.username}@local`;
  const seedEmail = me.email ?? `${me.username}@local`;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData(); fd.append('avatar', file);
      const res = await apiFetch('/api/auth/me/avatar', { method: 'POST', body: fd });
      if (!res.ok) { const b = (await res.json().catch(() => ({}))) as { message?: string }; setError(b.message ?? `Upload failed (${res.status})`); return; }
      const b = (await res.json()) as { avatarUrl: string };
      const fresh = `${b.avatarUrl}?t=${Date.now()}`;
      setAvatarUrl(fresh); onAvatarChange?.(fresh);
    } catch { setError('Upload failed. Please try again.'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  async function handleRemove(): Promise<void> {
    setUploading(true); setError(null);
    try {
      const res = await apiFetch('/api/auth/me/avatar', { method: 'DELETE' });
      if (!res.ok) { const b = (await res.json().catch(() => ({}))) as { message?: string }; setError(b.message ?? `Remove failed (${res.status})`); return; }
      setAvatarUrl(null); onAvatarChange?.(null);
    } catch { setError('Remove failed. Please try again.'); }
    finally { setUploading(false); }
  }

  function discard(): void { setDisplayName(initialName); setEmail(initialEmail); setError(null); }

  async function save(): Promise<void> {
    setSaving(true); setError(null);
    try {
      const res = await apiFetch('/api/auth/me/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, email }),
      });
      if (!res.ok) { const b = (await res.json().catch(() => ({}))) as { message?: string }; setError(b.message ?? `Save failed (${res.status})`); return; }
      window.location.reload();
    } catch { setError('Save failed. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {/* set-head */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">Profile</h2>
          <p className="mt-1.5 max-w-[540px] text-sm leading-relaxed text-muted-foreground">
            How you appear to other users and what bookkeeprr calls you in the audit log.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={discard}>Discard</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>

      {/* set-section: Identity (label-left / content-right) */}
      <div id="identity" className="grid scroll-mt-24 grid-cols-1 gap-6 border-b border-border py-7 md:grid-cols-[240px_1fr] md:gap-10">
        <div>
          <div className="font-display text-[17px] font-semibold tracking-[-0.015em] text-foreground">Identity</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Your avatar is generated from your initials unless you upload one. You sign in with your username.
          </p>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change avatar"
            >
              <Avatar email={seedEmail} name={shownName} size={64} avatarUrl={avatarUrl} variant={colorFromSeed(seedEmail)} />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border border-border bg-card text-muted-foreground">
                <Pencil className="h-3 w-3" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-base font-semibold text-foreground">{shownName}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{shownEmail}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
              {avatarUrl !== null && (
                <Button size="sm" variant="ghost" disabled={uploading} onClick={() => void handleRemove()}
                  className="text-[var(--color-err)] hover:bg-[var(--color-err)]/10 hover:text-[var(--color-err)]">
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="profile-display-name" hint="Shown across the app. Defaults to your username.">
              <Input id="profile-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={me.username} maxLength={80} />
            </Field>
            <Field label="Email" htmlFor="profile-email" hint={me.authSource && me.authSource !== 'local' ? `Managed by ${me.authSource}.` : 'Used for your Gravatar.'}>
              <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} />
            </Field>
          </div>

          {error !== null && <p className="text-xs text-[var(--color-err)]">{error}</p>}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void handleFileChange(e)} />
    </div>
  );
}
