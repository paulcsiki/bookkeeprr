import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import type { SettingsStackParamList } from '@/navigation/types';
import { CLOUD_FEATURES_ENABLED } from '@/lib/features';
import {
  RefreshCw,
  Tag,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Search,
  Globe,
  Download,
  Database,
  Library,
  BookMarked,
  Newspaper,
  ShieldCheck,
  FolderSearch,
  HardDrive,
  RefreshCcw,
  Compass,
  Bell,
  Users,
  Lock,
  KeyRound,
  ScrollText,
  FileText,
  Cloud,
  Monitor,
  Info,
} from 'lucide-react-native';
import Appearance from '@/screens/settings/Appearance';
import UpdatesScreen from '@/screens/settings/Updates';
import NamingScreen from '@/screens/settings/Naming';
import AutoGrabScreen from '@/screens/settings/AutoGrab';
import MatcherScreen from '@/screens/settings/Matcher';
import HousekeepingScreen from '@/screens/settings/Housekeeping';
import DownloadsScreen from '@/screens/settings/Downloads';
import UsersScreen from '@/screens/settings/Users';
import AuthScreen from '@/screens/settings/Auth';
import ApiAccessScreen from '@/screens/settings/ApiAccess';
import NotificationsScreen from '@/screens/settings/Notifications';
import AuditScreen from '@/screens/settings/Audit';
import LogsScreen from '@/screens/settings/Logs';
import CloudScreen from '@/screens/settings/Cloud';
import VersionHistoryScreen from '@/screens/settings/VersionHistory';
import { PushNotifications } from '@/screens/settings/PushNotifications';
import ComicVineScreen from '@/screens/settings/ComicVine';
import GoogleBooksScreen from '@/screens/settings/GoogleBooks';
import MyAnimeListScreen from '@/screens/settings/MyAnimeList';
import NewYorkTimesScreen from '@/screens/settings/NewYorkTimes';
import SearchProvidersScreen from '@/screens/settings/SearchProviders';
import QBittorrentScreen from '@/screens/settings/QBittorrent';
import FlareSolverrScreen from '@/screens/settings/FlareSolverr';
import IndexersScreen from '@/screens/settings/Indexers';
import LibraryScanScreen from '@/screens/settings/LibraryScan';
import DiscoverScreen from '@/screens/settings/Discover';
import StorageScreen from '@/screens/settings/Storage';
import LibrarySyncScreen from '@/screens/settings/LibrarySync';

type IconCmp = LucideIcon;

export interface SettingsNavItem {
  key: string;
  label: string;
  Icon: IconCmp;
  Component: ComponentType;
  status: 'native' | 'soon';
  adminOnly?: boolean;
  /** Stack route for phone navigation; native items only. */
  route?: keyof SettingsStackParamList;
  /** Whether the screen is fully usable with no server reachable.
   *  Omitted ⇒ treated as 'server' (the fail-safe default for admin config). */
  offline?: 'local' | 'server';
  /** Gated off behind CLOUD_FEATURES_ENABLED until the cloud service ships. */
  hidden?: boolean;
}
export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: 'General',
    items: [
      {
        key: 'updates',
        label: 'Updates',
        Icon: RefreshCw,
        status: 'native',
        adminOnly: true,
        Component: UpdatesScreen,
        route: 'Updates',
      },
      {
        key: 'naming',
        label: 'Naming',
        Icon: Tag,
        status: 'native',
        adminOnly: true,
        Component: NamingScreen,
        route: 'Naming',
      },
      {
        key: 'auto-grab',
        label: 'Auto-Grab',
        Icon: Sparkles,
        status: 'native',
        adminOnly: true,
        Component: AutoGrabScreen,
        route: 'AutoGrab',
      },
      {
        key: 'matcher',
        label: 'Matcher',
        Icon: SlidersHorizontal,
        status: 'native',
        adminOnly: true,
        Component: MatcherScreen,
        route: 'Matcher',
      },
      {
        key: 'housekeeping',
        label: 'Housekeeping',
        Icon: Trash2,
        status: 'native',
        adminOnly: true,
        Component: HousekeepingScreen,
        route: 'Housekeeping',
      },
    ],
  },
  {
    label: 'Sources',
    items: [
      {
        key: 'search-providers',
        label: 'Search Providers',
        Icon: Search,
        status: 'native',
        adminOnly: true,
        Component: SearchProvidersScreen,
        route: 'SearchProviders',
      },
      {
        key: 'indexers',
        label: 'Indexers',
        Icon: Globe,
        status: 'native',
        adminOnly: true,
        Component: IndexersScreen,
        route: 'Indexers',
      },
      {
        key: 'qbittorrent',
        label: 'Download Client',
        Icon: Download,
        status: 'native',
        adminOnly: true,
        Component: QBittorrentScreen,
        route: 'QBittorrent',
      },
      {
        key: 'comicvine',
        label: 'Metadata',
        Icon: Database,
        status: 'native',
        adminOnly: true,
        Component: ComicVineScreen,
        route: 'ComicVine',
      },
      {
        key: 'googlebooks',
        label: 'Google Books',
        Icon: Library,
        status: 'native',
        adminOnly: true,
        Component: GoogleBooksScreen,
        route: 'GoogleBooks',
      },
      {
        key: 'mal',
        label: 'MyAnimeList',
        Icon: BookMarked,
        status: 'native',
        adminOnly: true,
        Component: MyAnimeListScreen,
        route: 'MyAnimeList',
      },
      {
        key: 'nyt',
        label: 'New York Times',
        Icon: Newspaper,
        status: 'native',
        adminOnly: true,
        Component: NewYorkTimesScreen,
        route: 'NewYorkTimes',
      },
      {
        key: 'flaresolverr',
        label: 'FlareSolverr',
        Icon: ShieldCheck,
        status: 'native',
        adminOnly: true,
        Component: FlareSolverrScreen,
        route: 'FlareSolverr',
      },
    ],
  },
  {
    label: 'Library',
    items: [
      {
        key: 'library-scan',
        label: 'Library Scan',
        Icon: FolderSearch,
        status: 'native',
        adminOnly: true,
        Component: LibraryScanScreen,
        route: 'LibraryScan',
      },
      {
        key: 'storage',
        label: 'Storage',
        Icon: HardDrive,
        status: 'native',
        adminOnly: true,
        Component: StorageScreen,
        route: 'Storage',
      },
      {
        key: 'library-sync',
        label: 'Library Sync',
        Icon: RefreshCcw,
        status: 'native',
        adminOnly: true,
        Component: LibrarySyncScreen,
        route: 'LibrarySync',
      },
      {
        key: 'discover',
        label: 'Discover',
        Icon: Compass,
        status: 'native',
        adminOnly: true,
        Component: DiscoverScreen,
        route: 'Discover',
      },
      {
        key: 'notifications',
        label: 'Notifications',
        Icon: Bell,
        status: 'native',
        adminOnly: true,
        Component: NotificationsScreen,
        route: 'Notifications',
      },
    ],
  },
  {
    label: 'Access',
    items: [
      {
        key: 'users',
        label: 'Users',
        Icon: Users,
        status: 'native',
        adminOnly: true,
        Component: UsersScreen,
        route: 'Users',
      },
      {
        key: 'auth',
        label: 'Authentication',
        Icon: Lock,
        status: 'native',
        adminOnly: true,
        Component: AuthScreen,
        route: 'Auth',
      },
      {
        key: 'api',
        label: 'API Access',
        Icon: KeyRound,
        status: 'native',
        adminOnly: true,
        Component: ApiAccessScreen,
        route: 'ApiAccess',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        key: 'audit',
        label: 'Audit Log',
        Icon: ScrollText,
        status: 'native',
        adminOnly: true,
        Component: AuditScreen,
        route: 'Audit',
      },
      {
        key: 'logs',
        label: 'Logs',
        Icon: FileText,
        status: 'native',
        adminOnly: true,
        Component: LogsScreen,
        route: 'Logs',
      },
      {
        key: 'cloud',
        label: 'Cloud Connection',
        Icon: Cloud,
        status: 'native',
        adminOnly: true,
        Component: CloudScreen,
        route: 'Cloud',
        hidden: true,
      },
    ],
  },
  {
    label: 'App',
    items: [
      {
        key: 'appearance',
        label: 'Appearance',
        Icon: Monitor,
        status: 'native',
        Component: Appearance,
        route: 'Appearance',
        offline: 'local',
      },
      {
        key: 'downloads',
        label: 'Downloads',
        Icon: Download,
        status: 'native',
        Component: DownloadsScreen,
        route: 'Downloads',
        offline: 'local',
      },
      {
        key: 'push',
        label: 'Push Notifications',
        Icon: Bell,
        status: 'native',
        Component: PushNotifications,
        route: 'PushNotifications',
        hidden: true,
      },
      {
        key: 'version',
        label: 'Version History',
        Icon: Info,
        status: 'native',
        Component: VersionHistoryScreen,
        route: 'VersionHistory',
        offline: 'local',
      },
    ],
  },
];

export function visibleGroups(isAdmin: boolean): SettingsNavGroup[] {
  return SETTINGS_NAV.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => (isAdmin || !i.adminOnly) && (CLOUD_FEATURES_ENABLED || !i.hidden),
    ),
  })).filter((g) => g.items.length > 0);
}

/** Connectivity class for a settings item; omitted field ⇒ 'server' (fail-safe). */
export function settingsItemOffline(item: SettingsNavItem): 'local' | 'server' {
  return item.offline ?? 'server';
}
