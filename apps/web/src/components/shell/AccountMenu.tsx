'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { User, Bell, Contrast, LogOut, ChevronDown } from 'lucide-react';
import { Avatar, AppearanceDialog, colorFromSeed } from '@bookkeeprr/ui';
import { apiFetch } from '@/lib/api-fetch';

type Me = { id: number; username: string; email?: string; displayName?: string | null; role: 'admin' | 'user'; avatarUrl?: string | null } | null;

export function AccountMenu(): React.JSX.Element | null {
  const [me, setMe] = useState<Me>(null);
  const [open, setOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/auth/me')
      .then((r) => r.json() as Promise<{ user: Me }>)
      .then((j) => { if (!cancelled) setMe(j.user); })
      .catch(() => { /* no-auth — hide */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function logout(): Promise<void> {
    setLoggingOut(true);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  }

  if (me === null) return null;

  const email = me.email ?? `${me.username}@local`;
  const shownName = me.displayName?.trim() || me.username;
  const firstName = shownName.split(/[\s._-]+/)[0] ?? shownName;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-transparent py-0.5 pl-1.5 pr-2.5 hover:border-border hover:bg-card"
      >
        <Avatar email={email} name={shownName} size={30} avatarUrl={me.avatarUrl} variant={colorFromSeed(email)} />
        <span className="text-sm font-medium text-foreground/80">{firstName}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[272px] overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
        >
          <div className="flex items-start gap-3 border-b border-border p-4">
            <Avatar email={email} name={shownName} size={42} avatarUrl={me.avatarUrl} variant={colorFromSeed(email)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{shownName}</div>
              <div className="truncate font-mono text-[10.5px] text-muted-foreground">{email}</div>
              <span
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
                  me.role === 'admin'
                    ? 'border-primary/35 bg-primary/10 text-primary'
                    : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-[5px] w-[5px] rounded-full ${me.role === 'admin' ? 'bg-primary' : 'bg-muted-foreground'}`}
                />
                {me.role}
              </span>
            </div>
          </div>
          <div className="p-1.5">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded px-2.5 py-2 text-sm text-foreground hover:bg-muted"
            >
              <User className="h-3.5 w-3.5 text-muted-foreground" /> Account settings
            </Link>
            <Link
              href="/settings/notifications"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded px-2.5 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Bell className="h-3.5 w-3.5 text-muted-foreground" /> Notifications
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); setAppearanceOpen(true); }}
              className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <Contrast className="h-3.5 w-3.5 text-muted-foreground" /> Appearance
            </button>
            <div className="my-1.5 mx-2 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={() => void logout()}
              className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-left text-sm text-[var(--color-err)] hover:bg-[var(--color-err)]/10"
            >
              <LogOut className="h-3.5 w-3.5" /> {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
      {appearanceOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={() => setAppearanceOpen(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <AppearanceDialog open onOpenChange={setAppearanceOpen} />
          </div>
        </div>
      )}
    </div>
  );
}
