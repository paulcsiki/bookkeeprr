import { render, screen, waitFor } from '@testing-library/react-native';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import AuthHandoff from '@/screens/onboarding/AuthHandoff';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: jest.fn(), replace: jest.fn() }),
    useRoute: () => ({ params: { mode: 'forms' } }),
  };
});
jest.mock('react-native-inappbrowser-reborn', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(async () => true),
    // Resolve "cancel" so the screen settles into its retry state without a
    // real browser; the point under test is that the handoff auto-launches.
    openAuth: jest.fn(async () => ({ type: 'cancel' })),
  },
}));

it('auto-launches the secure browser with no manual open-browser step', async () => {
  await render(
    <ThemeProvider>
      <AuthProvider>
        <AuthHandoff />
      </AuthProvider>
    </ThemeProvider>,
  );
  // The handoff screen renders…
  expect(screen.getByTestId('screen-auth-handoff-forms')).toBeTruthy();
  // …and opens the browser automatically — no "Open browser" button to tap.
  await waitFor(() =>
    expect((InAppBrowser as unknown as { openAuth: jest.Mock }).openAuth).toHaveBeenCalled(),
  );
  expect(screen.queryByTestId('btn-open-browser')).toBeNull();
});
