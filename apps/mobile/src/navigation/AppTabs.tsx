import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { AppTabsParamList } from './types';
import { AppTabBar } from './AppTabBar';
import { HomeStack } from './HomeStack';
import { LibraryStack } from './LibraryStack';
import { SettingsStack } from './SettingsStack';
import Activity from '@/screens/Activity';

const Tab = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      {/* Discover moved off the tab bar — it's reached from the Home dashboard. */}
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Library" component={LibraryStack} />
      <Tab.Screen name="Activity" component={Activity} />
      <Tab.Screen name="Settings" component={SettingsStack} />
    </Tab.Navigator>
  );
}
