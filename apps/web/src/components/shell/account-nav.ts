import {
  UserCircle,
  Lock,
  ShieldCheck,
  MonitorSmartphone,
  KeyRound,
  Bell,
  Sun,
  AlertOctagon,
  type LucideIcon,
} from 'lucide-react';

export type AccountNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Flat left-rail nav for the account shell. Order = display order. */
export const ACCOUNT_NAV: AccountNavItem[] = [
  { href: '/account/profile', label: 'Profile', icon: UserCircle },
  { href: '/account/security', label: 'Security', icon: Lock },
  { href: '/account/two-factor', label: 'Two-Factor', icon: ShieldCheck },
  { href: '/account/sessions', label: 'Sessions', icon: MonitorSmartphone },
  { href: '/account/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/account/notifications', label: 'Notifications', icon: Bell },
  { href: '/account/appearance', label: 'Appearance', icon: Sun },
  { href: '/account/danger', label: 'Danger Zone', icon: AlertOctagon },
];

/** Flat href → label lookup for breadcrumbs / titles. */
export const ACCOUNT_LABELS: Record<string, string> = Object.fromEntries(
  ACCOUNT_NAV.map((i) => [i.href, i.label]),
);
