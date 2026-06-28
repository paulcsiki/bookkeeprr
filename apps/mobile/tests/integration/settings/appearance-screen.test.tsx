import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import Appearance from '@/screens/settings/Appearance';
import { ThemeProvider } from '@/theme/ThemeProvider';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: mockGoBack,
      reset: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => () => undefined),
      isFocused: () => true,
    }),
    useRoute: () => ({ params: {}, key: 'mock-route', name: 'Appearance' }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      cb();
    },
    useIsFocused: () => true,
  };
});

beforeEach(() => {
  mockGoBack.mockClear();
});

async function renderScreen() {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <ThemeProvider>
        <Appearance />
      </ThemeProvider>,
    );
  });
  return utils;
}

it('renders the Appearance screen with theme controls', async () => {
  await renderScreen();
  expect(screen.getByTestId('screen-appearance')).toBeTruthy();
  // Both a scheme toggle and accent swatches are present (parity with the old sheet).
  expect(screen.getByTestId('scheme-light')).toBeTruthy();
  expect(screen.getByTestId('scheme-dark')).toBeTruthy();
  expect(screen.getByTestId('swatch-sakura')).toBeTruthy();
});

it('selecting an accent swatch marks it active', async () => {
  await renderScreen();
  const swatch = screen.getByTestId('swatch-sakura');
  await act(async () => {
    fireEvent.press(swatch);
  });
  // The pressed swatch becomes the selected accent (active border width = 2).
  await waitFor(() => {
    expect(screen.getByTestId('swatch-sakura').props.accessibilityState?.selected).toBe(true);
  });
});

it('toggling the scheme updates the active scheme control', async () => {
  await renderScreen();
  await act(async () => {
    fireEvent.press(screen.getByTestId('scheme-light'));
  });
  // After switching to light, Sumi becomes selectable and Galley is disabled.
  await waitFor(() => {
    expect(screen.getByTestId('swatch-galley').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('swatch-sumi').props.accessibilityState?.disabled).toBe(false);
  });
});

it('back arrow calls goBack', async () => {
  await renderScreen();
  await act(async () => {
    fireEvent.press(screen.getByTestId('btn-back-appearance'));
  });
  expect(mockGoBack).toHaveBeenCalled();
});
