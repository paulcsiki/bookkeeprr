import { useEffect } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';
import { OnboardingStack } from './OnboardingStack';
import { AppTabs } from './AppTabs';
import { useAuth } from '@/auth/AuthContext';
import { useLayout } from '@/responsive/useLayout';
import { TabletAppShell } from '@/components/TabletAppShell';
import { InAppBanner } from '@/push/InAppBanner';
import { ErrorBoundary } from '@/lib/ErrorBoundary';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Selects the App screen body based on viewport class. Lives below the
// NavigationContainer so navigation hooks have a navigator parent.
function AppShell() {
  const layout = useLayout();
  return layout.isTablet ? <TabletAppShell /> : <AppTabs />;
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['bookkeeprr://'],
  config: {
    screens: {
      // NOTE: the auth callback (bookkeeprr://auth/callback?exchange=…) is
      // intentionally NOT mapped here. AuthHandoff consumes it directly via its
      // own Linking listener; letting React Navigation route it would re-focus
      // AuthHandoff and re-trigger the browser handoff.
      App: {
        screens: {
          Library: {
            screens: {
              SeriesOverview: 'library/series/:seriesId',
            },
          },
        },
      },
    },
  },
};

export function RootNavigator() {
  const { state } = useAuth();
  const navRef = useNavigationContainerRef<RootStackParamList>();

  // When the session ends — a manual sign-out, or a 401/403 that clears the
  // stored creds via onAuthFail → signOut — bounce back to onboarding.
  // `initialRouteName` only applies on mount, so without this the app would
  // sit on a now-unauthenticated App screen with every query disabled — i.e.
  // Library spinning forever, never reaching the login flow.
  useEffect(() => {
    if (state.status === 'unauthenticated' && navRef.isReady()) {
      navRef.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
    }
  }, [state.status, navRef]);

  if (state.status === 'loading') return null;
  const initialRoute = state.status === 'authenticated' ? 'App' : 'Onboarding';
  return (
    <ErrorBoundary>
      <NavigationContainer ref={navRef} linking={linking}>
        <View style={{ flex: 1 }}>
          <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
            <Stack.Screen name="Onboarding" component={OnboardingStack} />
            <Stack.Screen name="App" component={AppShell} />
          </Stack.Navigator>
          <InAppBanner />
        </View>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
