import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from './types';
import HomeDashboard from '@/screens/HomeDashboard';
import DiscoverHome from '@/screens/discover/DiscoverHome';
import CalendarMonth from '@/screens/calendar/CalendarMonth';
import CalendarDay from '@/screens/calendar/CalendarDay';
import Reader from '@/screens/reader/Reader';
import UserProfile from '@/screens/profile/UserProfile';
import { useTokens } from '@/theme/ThemeProvider';

const Stack = createNativeStackNavigator<HomeStackParamList>();

/**
 * Home tab stack: the dashboard plus Discover (which moved off the bottom tab
 * bar — it's now reached from the dashboard's Discover icon).
 */
export function HomeStack() {
  const t = useTokens();
  return (
    <Stack.Navigator initialRouteName="Dashboard" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="Dashboard" component={HomeDashboard} />
      <Stack.Screen name="Discover" component={DiscoverHome} />
      <Stack.Screen name="Calendar" component={CalendarMonth} />
      <Stack.Screen name="CalendarDay" component={CalendarDay} />
      <Stack.Screen name="UserProfile" component={UserProfile} />
      <Stack.Screen
        name="Reader"
        component={Reader}
        options={{ presentation: 'fullScreenModal', headerShown: false }}
      />
    </Stack.Navigator>
  );
}
