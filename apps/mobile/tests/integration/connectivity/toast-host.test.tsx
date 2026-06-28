import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ToastHost } from '@/components/ToastHost';
import { useToasts, toast } from '@/state/toastStore';

// Harness notes — mirrors tests/unit/push/InAppBanner.test.tsx, the proven
// idiom in this repo for a self-dismissing component under fake timers:
//  - `await render(...)` and use the DESTRUCTURED query helpers (getByText,
//    queryByText, getByTestId), NOT the global `screen` singleton — global
//    `screen` is only safe with a synchronous (un-awaited) render, and here we
//    need to await so the React 19 concurrent root flushes before we read.
//  - Fake timers are scoped per test with try/finally so a leftover act/timer
//    can't corrupt the next test's render.
//  - The imperative `toast(...)` enqueue and the timer advance are wrapped in
//    `await act(async () => …)` so the store update + subscription re-render
//    flush fully under React's control before the synchronous assertion.

function renderHost() {
  return render(
    <ThemeProvider>
      <ToastHost />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  useToasts.setState({ toasts: [] });
});

it('renders a toast and auto-dismisses it after the default duration', async () => {
  jest.useFakeTimers();
  try {
    const { getByText, getByTestId, queryByText } = await renderHost();
    await act(async () => {
      toast({ message: 'hello' });
    });
    expect(getByText('hello')).toBeTruthy();
    expect(getByTestId('toast')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(3500);
    });
    expect(queryByText('hello')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('dismisses a toast when tapped', async () => {
  jest.useFakeTimers();
  try {
    const { getByText, getByTestId, queryByText } = await renderHost();
    await act(async () => {
      toast({ message: 'tap me' });
    });
    expect(getByText('tap me')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('toast'));
    });
    expect(queryByText('tap me')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
