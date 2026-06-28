import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ServerUrl from '@/screens/onboarding/ServerUrl';
import { ThemeProvider } from '@/theme/ThemeProvider';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useRoute: () => ({ params: {} }),
  };
});

beforeEach(() => {
  mockNavigate.mockReset();
});

it('routes to forms handoff after successful handshake', async () => {
  (globalThis as { fetch: unknown }).fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      server_version: '0.1.0',
      supported_auth_modes: ['password'],
      brand: 'bookkeeprr',
    }),
  });
  await render(
    <ThemeProvider>
      <ServerUrl />
    </ThemeProvider>,
  );
  await fireEvent.changeText(screen.getByTestId('input-server-url'), 'https://srv');
  const btn = screen.getByTestId('btn-connect');
  await waitFor(() => expect(btn.props.accessibilityState?.disabled).toBeFalsy());
  await fireEvent.press(btn);
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('AuthHandoff', { mode: 'forms' }));
});

it('shows a friendly message when no server URL is entered', async () => {
  const fetchMock = jest.fn();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  await render(
    <ThemeProvider>
      <ServerUrl />
    </ThemeProvider>,
  );
  // Tap Connect with the field left empty.
  await fireEvent.press(screen.getByTestId('btn-connect'));
  await waitFor(() => expect(screen.getByText('Please enter your server URL.')).toBeTruthy());
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('shows SSL warning on cert error', async () => {
  (globalThis as { fetch: unknown }).fetch = jest
    .fn()
    .mockRejectedValueOnce(new Error('self-signed certificate'));
  await render(
    <ThemeProvider>
      <ServerUrl />
    </ThemeProvider>,
  );
  await fireEvent.changeText(screen.getByTestId('input-server-url'), 'https://srv');
  const btn = screen.getByTestId('btn-connect');
  await waitFor(() => expect(btn.props.accessibilityState?.disabled).toBeFalsy());
  await fireEvent.press(btn);
  await waitFor(() => expect(screen.getByTestId('ssl-warning')).toBeTruthy());
});
