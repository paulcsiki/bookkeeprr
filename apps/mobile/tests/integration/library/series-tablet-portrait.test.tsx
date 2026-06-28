/**
 * Integration tests for SeriesOverview in tablet-PORTRAIT orientation.
 *
 * A tablet in portrait (width: 768, height: 1024) is `isTablet` but NOT
 * `isLandscape`, so it falls through to the phone render path. Before the fix,
 * the hero was a full-bleed `flush` Cover that balloons to ~1024 px tall.
 * After the fix the hero should be constrained identically to the landscape
 * detail pane: maxWidth === DETAIL_HERO_MAX_WIDTH, alignSelf === 'flex-start'.
 *
 * A separate file is required because the `useWindowDimensions` mock is
 * module-level and would override the landscape mock in series-tablet.test.tsx.
 */
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SeriesOverview from '@/screens/library/SeriesOverview';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { DETAIL_HERO_MAX_WIDTH } from '@/responsive/breakpoints';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 768, height: 1024 }),
}));
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2026-08-25T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: { seriesId: '1' } }),
  };
});

it('renders a constrained left-aligned hero (not full-bleed) on tablet portrait', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesOverview />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  const hero = await screen.findByTestId('series-hero');
  expect(hero).toBeTruthy();
  const style = Array.isArray(hero.props.style)
    ? Object.assign({}, ...hero.props.style)
    : hero.props.style;
  // Constrained poster: capped and left-aligned, not a full-width giant cover.
  expect(style.maxWidth).toBe(DETAIL_HERO_MAX_WIDTH);
  expect(style.alignSelf).toBe('flex-start');
});

it('does NOT show the landscape split layout on tablet portrait', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesOverview />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  // series-hero must appear (confirming the portrait phone-path was reached)
  await screen.findByTestId('series-hero');
  // series-split must NOT appear — portrait goes through the phone/portrait path,
  // not the landscape SplitView branch.
  expect(screen.queryByTestId('series-split')).toBeNull();
});
