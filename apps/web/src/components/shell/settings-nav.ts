import {
  RefreshCw,
  Tag,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Globe,
  Download,
  Database,
  FolderSearch,
  HardDrive,
  RefreshCcw,
  Bell,
  Users,
  Lock,
  KeyRound,
  ScrollText,
  FileText,
  Cloud,
  BookMarked,
  Library,
  Newspaper,
  Compass,
  ShieldCheck,
  Search,
  type LucideIcon,
} from 'lucide-react';

export type SettingsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Admin-only items are hidden for non-admins. */
  adminOnly?: boolean;
  /** Gated off behind CLOUD_FEATURES_ENABLED until the cloud service ships. */
  hidden?: boolean;
};

export type SettingsNavGroup = {
  label: string;
  items: SettingsNavItem[];
};

/** Grouped left-rail nav for the settings shell. Order = display order. */
export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: 'General',
    items: [
      { href: '/settings/updates', label: 'Updates', icon: RefreshCw },
      { href: '/settings/naming', label: 'Naming', icon: Tag },
      { href: '/settings/auto-grab', label: 'Auto-Grab', icon: Sparkles },
      { href: '/settings/matcher', label: 'Matcher', icon: SlidersHorizontal },
      { href: '/settings/housekeeping', label: 'Housekeeping', icon: Trash2 },
    ],
  },
  {
    label: 'Sources',
    items: [
      { href: '/settings/search-providers', label: 'Search Providers', icon: Search },
      { href: '/settings/indexers', label: 'Indexers', icon: Globe },
      { href: '/settings/qbittorrent', label: 'Download Client', icon: Download },
      { href: '/settings/comicvine', label: 'Metadata', icon: Database },
      { href: '/settings/googlebooks', label: 'Google Books', icon: Library },
      { href: '/settings/mal', label: 'MyAnimeList', icon: BookMarked },
      { href: '/settings/nyt', label: 'New York Times', icon: Newspaper },
      { href: '/settings/flaresolverr', label: 'FlareSolverr', icon: ShieldCheck },
    ],
  },
  {
    label: 'Library',
    items: [
      { href: '/settings/library/scan', label: 'Library Scan', icon: FolderSearch },
      { href: '/settings/storage', label: 'Storage', icon: HardDrive },
      { href: '/settings/library-sync', label: 'Library Sync', icon: RefreshCcw },
      { href: '/settings/discover', label: 'Discover', icon: Compass },
      { href: '/settings/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Access',
    items: [
      { href: '/settings/users', label: 'Users', icon: Users, adminOnly: true },
      { href: '/settings/auth', label: 'Authentication', icon: Lock },
      { href: '/settings/api', label: 'API Access', icon: KeyRound },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings/audit', label: 'Audit Log', icon: ScrollText, adminOnly: true },
      { href: '/settings/logs', label: 'Logs', icon: FileText, adminOnly: true },
      { href: '/settings/cloud', label: 'Cloud Connection', icon: Cloud, adminOnly: true, hidden: true },
    ],
  },
];

/** Flat href → label lookup for breadcrumbs / titles. */
export const SETTINGS_LABELS: Record<string, string> = {
  ...Object.fromEntries(SETTINGS_NAV.flatMap((g) => g.items.map((i) => [i.href, i.label]))),
  '/settings/indexers/new': 'New Indexer',
  '/settings/users/new': 'New User',
};

/** Resolve the active nav href for a pathname (longest matching prefix). */
export function activeSettingsHref(pathname: string): string | null {
  let best: string | null = null;
  for (const group of SETTINGS_NAV) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        if (!best || item.href.length > best.length) best = item.href;
      }
    }
  }
  return best;
}
