'use client';

import { useState } from 'react';
import { md5 } from 'js-md5';
import { cn } from './utils';

export type AvatarProps = {
  email: string;
  name: string;
  size?: number;
  alt?: string;
  className?: string;
  /** Prefer this URL over Gravatar when set (e.g. /api/auth/me/avatar/:userId). */
  avatarUrl?: string | null;
  /** Colour variant 1-5 (drives .avatar.a-{n} CSS class; default 1). */
  variant?: 1 | 2 | 3 | 4 | 5;
};

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/**
 * Identity avatar — see `.avatar` + `.a-{n}` in the design system.
 * Renders initials as the always-present fallback; overlays a custom
 * avatarUrl (if provided) or Gravatar image, with error fallback to
 * initials transparently.
 *
 * Colour is driven by the `variant` prop (1-5); use `colorFromSeed(email)`
 * to pick a stable variant from the user's email address.
 */
export function Avatar({
  email,
  name,
  size = 28,
  alt,
  className,
  avatarUrl,
  variant = 1,
}: AvatarProps): React.JSX.Element {
  const [imgFailed, setImgFailed] = useState(false);
  const hash = md5(email.trim().toLowerCase());
  const gravatarSrc = `https://www.gravatar.com/avatar/${hash}?s=${size * 2}&d=404`;
  // Prefer custom avatar; fall back to Gravatar.
  const src = avatarUrl != null && avatarUrl.length > 0 ? avatarUrl : gravatarSrc;
  const label = alt ?? `Avatar for ${name}`;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('avatar', `a-${variant}`, 'relative overflow-hidden', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.34)),
      }}
    >
      <span aria-hidden>{initials(name)}</span>
      {!imgFailed && (
        <img
          src={src}
          alt=""
          aria-hidden
          onError={() => setImgFailed(true)}
          className="absolute inset-0 z-10 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
