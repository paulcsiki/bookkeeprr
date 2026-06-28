'use client';

import { useEffect, useState } from 'react';
import { ProfileSection } from '../components/ProfileSection';
import { apiFetch } from '@/lib/api-fetch';

type Me = {
  id: number;
  username: string;
  email?: string | null;
  displayName?: string | null;
  role: 'admin' | 'user';
  avatarUrl?: string | null;
  authSource?: string;
};

export default function AccountProfilePage(): React.JSX.Element {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then((r) => r.json() as Promise<{ user: Me | null }>)
      .then((j) => {
        setMe(j.user);
        if (j.user === null) window.location.href = '/login';
      })
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <p className="py-5 text-sm text-muted-foreground">Loading…</p>;
  if (me === null) return <p className="py-5 text-sm text-muted-foreground">Not signed in.</p>;
  return <ProfileSection me={me} />;
}
