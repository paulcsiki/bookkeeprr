import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from './types';
import SettingsHome from '@/screens/settings/SettingsHome';
import { MobAccount } from '@/screens/settings/MobAccount';
import Updates from '@/screens/settings/Updates';
import Naming from '@/screens/settings/Naming';
import AutoGrab from '@/screens/settings/AutoGrab';
import Matcher from '@/screens/settings/Matcher';
import Housekeeping from '@/screens/settings/Housekeeping';
import Notifications from '@/screens/settings/Notifications';
import Users from '@/screens/settings/Users';
import Auth from '@/screens/settings/Auth';
import ApiAccess from '@/screens/settings/ApiAccess';
import Appearance from '@/screens/settings/Appearance';
import Audit from '@/screens/settings/Audit';
import Logs from '@/screens/settings/Logs';
import Cloud from '@/screens/settings/Cloud';
import VersionHistory from '@/screens/settings/VersionHistory';
import PushNotifications from '@/screens/settings/PushNotifications';
import Downloads from '@/screens/settings/Downloads';
import MobNotifications from '@/screens/settings/MobNotifications';
import MobSessions from '@/screens/settings/MobSessions';
import MobTotp from '@/screens/settings/MobTotp';
import SearchProviders from '@/screens/settings/SearchProviders';
import ComicVine from '@/screens/settings/ComicVine';
import GoogleBooks from '@/screens/settings/GoogleBooks';
import MyAnimeList from '@/screens/settings/MyAnimeList';
import NewYorkTimes from '@/screens/settings/NewYorkTimes';
import QBittorrent from '@/screens/settings/QBittorrent';
import FlareSolverr from '@/screens/settings/FlareSolverr';
import Indexers from '@/screens/settings/Indexers';
import LibraryScan from '@/screens/settings/LibraryScan';
import LibrarySync from '@/screens/settings/LibrarySync';
import Discover from '@/screens/settings/Discover';
import Storage from '@/screens/settings/Storage';
import UserProfile from '@/screens/profile/UserProfile';
import EditIndexer from '@/screens/settings/EditIndexer';
import CreateUser from '@/screens/settings/CreateUser';
import CloudConnect from '@/screens/settings/CloudConnect';

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  return (
    <Stack.Navigator initialRouteName="SettingsHome" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsHome" component={SettingsHome} />
      <Stack.Screen name="MobAccount" component={MobAccount} />
      <Stack.Screen name="Updates" component={Updates} />
      <Stack.Screen name="Naming" component={Naming} />
      <Stack.Screen name="AutoGrab" component={AutoGrab} />
      <Stack.Screen name="Matcher" component={Matcher} />
      <Stack.Screen name="Housekeeping" component={Housekeeping} />
      <Stack.Screen name="Notifications" component={Notifications} />
      <Stack.Screen name="Users" component={Users} />
      <Stack.Screen name="Auth" component={Auth} />
      <Stack.Screen name="ApiAccess" component={ApiAccess} />
      <Stack.Screen name="Appearance" component={Appearance} />
      <Stack.Screen name="Audit" component={Audit} />
      <Stack.Screen name="Logs" component={Logs} />
      <Stack.Screen name="Cloud" component={Cloud} />
      <Stack.Screen name="VersionHistory" component={VersionHistory} />
      <Stack.Screen name="PushNotifications" component={PushNotifications} />
      <Stack.Screen name="Downloads" component={Downloads} />
      <Stack.Screen name="MobNotifications" component={MobNotifications} />
      <Stack.Screen name="MobSessions" component={MobSessions} />
      <Stack.Screen name="MobTotp" component={MobTotp} />
      <Stack.Screen name="SearchProviders" component={SearchProviders} />
      <Stack.Screen name="ComicVine" component={ComicVine} />
      <Stack.Screen name="GoogleBooks" component={GoogleBooks} />
      <Stack.Screen name="MyAnimeList" component={MyAnimeList} />
      <Stack.Screen name="NewYorkTimes" component={NewYorkTimes} />
      <Stack.Screen name="QBittorrent" component={QBittorrent} />
      <Stack.Screen name="FlareSolverr" component={FlareSolverr} />
      <Stack.Screen name="Indexers" component={Indexers} />
      <Stack.Screen name="LibraryScan" component={LibraryScan} />
      <Stack.Screen name="LibrarySync" component={LibrarySync} />
      <Stack.Screen name="Discover" component={Discover} />
      <Stack.Screen name="Storage" component={Storage} />
      <Stack.Screen name="UserProfile" component={UserProfile} />
      <Stack.Screen name="EditIndexer" component={EditIndexer} />
      <Stack.Screen name="CreateUser" component={CreateUser} />
      <Stack.Screen name="CloudConnect" component={CloudConnect} />
    </Stack.Navigator>
  );
}
