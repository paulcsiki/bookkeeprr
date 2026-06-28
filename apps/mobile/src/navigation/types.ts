import type { NavigatorScreenParams } from '@react-navigation/native';

export type OnboardingStackParamList = {
  Welcome: undefined;
  Features: undefined;
  ServerUrl: undefined;
  TrustCert: undefined;
  AuthHandoff: { mode?: 'forms' | 'oidc' };
  Connected: undefined;
};

export type LibraryStackParamList = {
  LibraryHome: undefined;
  SeriesOverview: { seriesId: string };
  SeriesVolumes: { seriesId: string };
  AddSeries: undefined;
  FilterSheet: undefined;
  InteractiveSearch: { seriesId: string };
  Reader: { volumeId?: string; fileId?: string };
  /** Book series detail screen — added in Task 18. Route is typed here so
   *  Task 17 components can navigate to it without a cast. */
  BookSeriesDetail: { bookSeriesId: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  MobAccount: undefined;
  Updates: undefined;
  Naming: undefined;
  AutoGrab: undefined;
  Matcher: undefined;
  Housekeeping: undefined;
  Notifications: undefined;
  Users: undefined;
  Auth: undefined;
  ApiAccess: undefined;
  Appearance: undefined;
  Audit: undefined;
  Logs: undefined;
  Cloud: undefined;
  VersionHistory: undefined;
  PushNotifications: undefined;
  Downloads: undefined;
  MobNotifications: undefined;
  MobSessions: undefined;
  MobTotp: undefined;
  SearchProviders: undefined;
  ComicVine: undefined;
  GoogleBooks: undefined;
  MyAnimeList: undefined;
  NewYorkTimes: undefined;
  QBittorrent: undefined;
  FlareSolverr: undefined;
  Indexers: undefined;
  LibraryScan: undefined;
  LibrarySync: undefined;
  Discover: undefined;
  Storage: undefined;
  // Member profile, reached from the Users list rows (admins).
  UserProfile: { userId: number };
  EditIndexer: { indexerId?: number };
  CreateUser: undefined;
  CloudConnect: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  Discover: undefined;
  // Release calendar (header icon on the dashboard). A day tap on phones
  // pushes CalendarDay; tablet landscape shows the day inline in a SplitView.
  Calendar: undefined;
  CalendarDay: { date: string }; // YYYY-MM-DD
  // Continue-reading cards on the dashboard open the reader within this stack.
  Reader: { volumeId?: string; fileId?: string };
  // Member profile, reached from the dashboard's household leaderboard rows
  // (mirrors the web dashboard's LeaderboardWidget → /profile/[userId] links).
  UserProfile: { userId: number };
};

export type AppTabsParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Library: NavigatorScreenParams<LibraryStackParamList>;
  Activity: undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};

export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  App: NavigatorScreenParams<AppTabsParamList>;
};
