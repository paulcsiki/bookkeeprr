/**
 * Cross-tab navigation regression: opening a Library detail from another tab
 * (e.g. Profile in the Home stack) must seed the Library stack with
 * LibraryHome at the root, so that:
 *   - back from SeriesOverview returns to LibraryHome (NOT the originating
 *     Home/Profile screen, and NOT falling through to the tab navigator),
 *   - re-selecting the Library tab and popping-to-top returns to LibraryHome,
 *   - re-selecting the Library tab does not strand the user on the detail.
 *
 * This reproduces the user's tablet repro using the SHARED phone navigators'
 * config. We use minimal stub screens registered with the SAME navigator
 * config (Tab + two native stacks, matching initialRouteName) so the test
 * exercises React Navigation's state machine without screen data deps.
 */
// The global safe-area mock (tests/setup.ts) returns zero insets but does not
// export the SafeAreaInsetsContext / SafeAreaFrameContext that
// @react-navigation/bottom-tabs' BottomTabView reads `.Consumer` from. Provide
// real contexts here so the bottom-tab navigator mounts in jsdom/node.
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
  const FRAME = { x: 0, y: 0, width: 375, height: 812 };
  const SafeAreaInsetsContext = React.createContext(INSETS);
  const SafeAreaFrameContext = React.createContext(FRAME);
  return {
    useSafeAreaInsets: () => INSETS,
    useSafeAreaFrame: () => FRAME,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }: { children: unknown }) =>
      React.createElement(React.Fragment, null, children),
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    SafeAreaView: ({ children }: { children: unknown }) =>
      React.createElement(React.Fragment, null, children),
    initialWindowMetrics: { insets: INSETS, frame: FRAME },
  };
});

import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { StackActions } from '@react-navigation/native';
import {
  NavigationContainer,
  createNavigationContainerRef,
  type NavigationState,
  type PartialState,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { openSeriesInLibrary, openReaderInLibrary } from '@/navigation/openSeriesInLibrary';

// --- Stub screens (content-free; the test asserts navigation STATE) ---------
function Stub({ label }: { label: string }) {
  return <Text>{label}</Text>;
}

type HomeStackParamList = {
  Dashboard: undefined;
  UserProfile: { userId: number };
};
type LibraryStackParamList = {
  LibraryHome: undefined;
  SeriesOverview: { seriesId: string };
  Reader: { volumeId?: string; fileId?: string };
};
type TabsParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Library: NavigatorScreenParams<LibraryStackParamList>;
};

const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
function HomeStack() {
  return (
    <HomeStackNav.Navigator
      initialRouteName="Dashboard"
      screenOptions={{ headerShown: false }}
    >
      <HomeStackNav.Screen name="Dashboard">{() => <Stub label="Dashboard" />}</HomeStackNav.Screen>
      <HomeStackNav.Screen name="UserProfile">{() => <Stub label="UserProfile" />}</HomeStackNav.Screen>
    </HomeStackNav.Navigator>
  );
}

const LibraryStackNav = createNativeStackNavigator<LibraryStackParamList>();
function LibraryStack() {
  return (
    <LibraryStackNav.Navigator
      initialRouteName="LibraryHome"
      screenOptions={{ headerShown: false }}
    >
      <LibraryStackNav.Screen name="LibraryHome">{() => <Stub label="LibraryHome" />}</LibraryStackNav.Screen>
      <LibraryStackNav.Screen name="SeriesOverview">{() => <Stub label="SeriesOverview" />}</LibraryStackNav.Screen>
      <LibraryStackNav.Screen name="Reader">{() => <Stub label="Reader" />}</LibraryStackNav.Screen>
    </LibraryStackNav.Navigator>
  );
}

const Tab = createBottomTabNavigator<TabsParamList>();
function AppTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Library" component={LibraryStack} />
    </Tab.Navigator>
  );
}

// --- State inspection helpers ----------------------------------------------
type AnyState = NavigationState | PartialState<NavigationState>;

/** Find the nested state of a route by name anywhere in the tree (BFS). */
function findRoute(state: AnyState | undefined, name: string): AnyState | undefined {
  if (!state?.routes) return undefined;
  for (const r of state.routes) {
    if (r.name === name) return (r.state as AnyState) ?? undefined;
    if (r.state) {
      const hit = findRoute(r.state as AnyState, name);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Names of routes in a stack state, in order. */
function routeNames(state: AnyState | undefined): string[] {
  return (state?.routes ?? []).map((r) => r.name);
}

/** Deepest focused route name in the whole tree. */
function focusedRouteName(state: AnyState | undefined): string | undefined {
  if (!state?.routes) return undefined;
  const idx = state.index ?? state.routes.length - 1;
  const r = state.routes[idx];
  if (!r) return undefined;
  if (r.state) return focusedRouteName(r.state as AnyState);
  return r.name;
}

async function renderApp() {
  const navRef = createNavigationContainerRef<TabsParamList>();
  await act(async () => {
    render(
      <NavigationContainer ref={navRef as never}>
        <AppTabs />
      </NavigationContainer>,
    );
  });
  return { navRef };
}

describe('cross-tab Library detail navigation', () => {
  it('seeds LibraryHome under SeriesOverview, and back returns to LibraryHome', async () => {
    const { navRef } = await renderApp();

    // Simulate: Home → Profile (push UserProfile in the Home stack).
    await act(async () => {
      navRef.navigate('Home', { screen: 'UserProfile', params: { userId: 7 } });
    });

    // Then the cross-tab "open this title in the Library" tap (the real app's
    // action), routed through the shared helper.
    await act(async () => {
      openSeriesInLibrary(navRef as never, '1');
    });

    const stateAfter = navRef.getRootState();
    const libState = findRoute(stateAfter, 'Library');

    // Assertion 1: the Library stack must be seeded with LibraryHome at the root.
    expect(routeNames(libState)).toEqual(['LibraryHome', 'SeriesOverview']);
    expect(focusedRouteName(stateAfter)).toBe('SeriesOverview');

    // Assertion 2: back from the detail returns to LibraryHome (the list),
    // NOT the originating Profile screen and NOT the Home tab.
    await act(async () => {
      navRef.goBack();
    });
    expect(focusedRouteName(navRef.getRootState())).toBe('LibraryHome');
  });

  it('pop-to-top on the Library tab returns to LibraryHome after a cross-tab open', async () => {
    const { navRef } = await renderApp();

    await act(async () => {
      navRef.navigate('Home', { screen: 'UserProfile', params: { userId: 7 } });
    });
    await act(async () => {
      openSeriesInLibrary(navRef as never, '1');
    });

    // Switch to Home, then back to Library — the user re-selecting the tab.
    await act(async () => {
      navRef.navigate('Home' as never);
    });
    await act(async () => {
      navRef.navigate('Library' as never);
    });

    // Re-selecting Library must NOT strand on the detail; the list root exists.
    const lib = findRoute(navRef.getRootState(), 'Library');
    expect(routeNames(lib)).toEqual(['LibraryHome', 'SeriesOverview']);

    // Pop-to-top (double-tap the tab) returns to LibraryHome.
    await act(async () => {
      navRef.dispatch({ ...StackActions.popToTop(), target: (lib as NavigationState).key } as never);
    });
    expect(focusedRouteName(findRoute(navRef.getRootState(), 'Library'))).toBe('LibraryHome');
  });

  it('does not regress within-Library navigation (LibraryHome → detail → back)', async () => {
    const { navRef } = await renderApp();

    await act(async () => {
      navRef.navigate('Library', { screen: 'LibraryHome' });
    });
    await act(async () => {
      navRef.navigate('Library', { screen: 'SeriesOverview', params: { seriesId: '9' } });
    });

    const lib = findRoute(navRef.getRootState(), 'Library');
    expect(routeNames(lib)).toEqual(['LibraryHome', 'SeriesOverview']);

    await act(async () => {
      navRef.goBack();
    });
    expect(focusedRouteName(findRoute(navRef.getRootState(), 'Library'))).toBe('LibraryHome');
  });

  it('opening a cross-tab series while Library is already deep keeps a rooted stack', async () => {
    const { navRef } = await renderApp();

    // User browses Library normally first: LibraryHome → SeriesOverview(A).
    await act(async () => {
      navRef.navigate('Library', { screen: 'LibraryHome' });
    });
    await act(async () => {
      navRef.navigate('Library', { screen: 'SeriesOverview', params: { seriesId: 'A' } });
    });

    // Then jumps to Home and opens a DIFFERENT series cross-tab.
    await act(async () => {
      navRef.navigate('Home' as never);
    });
    await act(async () => {
      openSeriesInLibrary(navRef as never, 'B');
    });

    // The Library stack must still be rooted at LibraryHome with the new detail
    // focused; back returns to LibraryHome (never strands on the tab root).
    const lib = findRoute(navRef.getRootState(), 'Library');
    expect(routeNames(lib)).toEqual(['LibraryHome', 'SeriesOverview']);
    expect(focusedRouteName(navRef.getRootState())).toBe('SeriesOverview');

    await act(async () => {
      navRef.goBack();
    });
    expect(focusedRouteName(findRoute(navRef.getRootState(), 'Library'))).toBe('LibraryHome');
  });

  it('seeds LibraryHome under the Reader when opened cross-tab (modal dismiss is sane)', async () => {
    const { navRef } = await renderApp();

    // Home → Profile, then a downloaded card opens the reader cross-tab.
    await act(async () => {
      navRef.navigate('Home', { screen: 'UserProfile', params: { userId: 7 } });
    });
    await act(async () => {
      openReaderInLibrary(navRef as never, { fileId: 'f1' });
    });

    const lib = findRoute(navRef.getRootState(), 'Library');
    expect(routeNames(lib)).toEqual(['LibraryHome', 'Reader']);
    expect(focusedRouteName(navRef.getRootState())).toBe('Reader');

    // Dismissing the reader modal lands on the Library list, not the tab root.
    await act(async () => {
      navRef.goBack();
    });
    expect(focusedRouteName(findRoute(navRef.getRootState(), 'Library'))).toBe('LibraryHome');
  });
});
