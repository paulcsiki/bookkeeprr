import { CommonActions, type NavigationProp, type NavigationAction } from '@react-navigation/native';
import type { AppTabsParamList, LibraryStackParamList } from './types';

// `CommonActions.navigate` is typed to return the wide `Action` union, whose
// `ResetAction.payload` is optional. Under the app's `exactOptionalPropertyTypes`
// that does not satisfy `dispatch`'s `payload?: object` parameter. The runtime
// shape is correct; narrow the type so callers stay type-safe.
const asAction = (a: ReturnType<typeof CommonActions.navigate>): NavigationAction =>
  a as NavigationAction;

/**
 * Open a series' detail (SeriesOverview) in the Library tab from anywhere —
 * including a different tab's stack (Home dashboard rails, the release
 * calendar, a user profile).
 *
 * The cross-tab subtlety: a bare `tabNav.navigate('Library', { screen:
 * 'SeriesOverview' })` initializes the Library stack to exactly
 * `[SeriesOverview]` when the Library tab has NOT been visited yet — an
 * imperative nested navigate does NOT honour the stack's `initialRouteName`
 * (that only seeds the stack when it mounts via tab focus). The result is a
 * "rootless" Library stack: pressing back falls through to the bottom-tab
 * navigator (landing on the originating tab), and pop-to-top has nothing to
 * pop. See tests/integration/navigation/cross-tab-back.test.tsx.
 *
 * The fix dispatches a navigate to the Library tab whose nested stack state is
 * seeded explicitly with `[LibraryHome, SeriesOverview]`, so back returns to
 * the list and tab pop-to-top behaves like a normally-visited tab.
 */
export function openSeriesInLibrary(
  rootNav: NavigationProp<AppTabsParamList>,
  seriesId: string | number,
): void {
  rootNav.dispatch(
    asAction(
      CommonActions.navigate('Library', {
        // Seed the Library stack with LibraryHome beneath the target detail so
        // back/pop-to-top return to the list.
        state: {
          index: 1,
          routes: [
            { name: 'LibraryHome' },
            { name: 'SeriesOverview', params: { seriesId: String(seriesId) } },
          ],
        },
      }),
    ),
  );
}

/**
 * Open the Reader (a fullScreenModal in the Library stack) cross-tab — e.g. a
 * "continue reading" / downloaded card on the Home dashboard.
 *
 * Same rootless-stack hazard as {@link openSeriesInLibrary}: a bare
 * `navigate('Library', { screen: 'Reader' })` leaves the Library stack as
 * `[Reader]`, so dismissing the reader modal with back falls through to the
 * tab navigator instead of landing on the Library list. Seed LibraryHome
 * beneath the Reader so the dismiss path is sane.
 */
export function openReaderInLibrary(
  rootNav: NavigationProp<AppTabsParamList>,
  readerParams: LibraryStackParamList['Reader'],
): void {
  rootNav.dispatch(
    asAction(
      CommonActions.navigate('Library', {
        state: {
          index: 1,
          routes: [{ name: 'LibraryHome' }, { name: 'Reader', params: readerParams }],
        },
      }),
    ),
  );
}
