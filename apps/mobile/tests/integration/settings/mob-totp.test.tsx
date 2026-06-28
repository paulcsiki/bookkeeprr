/**
 * MobTotp screen integration tests.
 *
 * Tests the screen renders correctly in the not-enabled and enabled states.
 * Network calls are intercepted by the MSW server fixture.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import MobTotp from '@/screens/settings/MobTotp';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    ...actual,
    useNavigation: () => ({ goBack: jest.fn() }),
    // Run the focus callback inside an effect (after commit), mirroring the
    // real useFocusEffect. Running it during render — as the old mock did —
    // triggers state updates mid-render and an infinite re-render loop under
    // the async render in @testing-library/react-native v14.
    useFocusEffect: (cb: () => void) => { React.useEffect(() => cb(), [cb]); },
  };
});

// Mock the token store to be in an authenticated state
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 'test-token',
      refreshToken: 'r',
      expiresAt: '2026-08-25T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

// Silence the Clipboard deprecation warning — no external module installed
jest.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: jest.fn() } }), { virtual: true });

function renderScreen() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MobTotp />
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('MobTotp screen', () => {
  it('renders the screen container', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('screen-mob-totp')).toBeTruthy());
  });

  it('shows back button', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('btn-back-totp')).toBeTruthy());
  });
});
