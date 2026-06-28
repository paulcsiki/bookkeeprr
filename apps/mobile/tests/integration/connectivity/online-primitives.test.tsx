import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { OnlineOnly, useOnlineGate } from '@/features/system/online';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

// Harness notes for this repo's RNTL 14 + React 19 (concurrent root) setup:
//  - `render`'s return value is empty; all queries + `rerender` live on the
//    global `screen` singleton (the idiom used by every integration suite here).
//  - `render`/`rerender` flush on a microtask, so the first `screen` read after
//    each is awaited via `waitFor`.
//  - The connectivity store is updated with a plain `setState` (NOT wrapped in
//    `act`): the following `screen.rerender` + awaited `waitFor` flush the
//    re-render under React's control. An explicit `act(setState)` here leaves
//    React 19's concurrent act queue dirty and breaks the next test's render.
function setOnline(v: boolean) {
  useConnectivity.setState({ deviceOnline: v, serverReachable: v ? true : false });
}
beforeEach(() => {
  useToasts.setState({ toasts: [] });
  setOnline(true);
});

it('OnlineOnly renders children online, fallback offline', async () => {
  render(<OnlineOnly fallback={<Text>off</Text>}><Text>on</Text></OnlineOnly>);
  await waitFor(() => expect(screen.getByText('on')).toBeTruthy());
  setOnline(false);
  screen.rerender(<OnlineOnly fallback={<Text>off</Text>}><Text>on</Text></OnlineOnly>);
  await waitFor(() => expect(screen.getByText('off')).toBeTruthy());
});

it('useOnlineGate runs the action online; offline it toasts and no-ops', async () => {
  const fn = jest.fn();
  function Btn() {
    const { gate, online } = useOnlineGate();
    // Surface `online` so the test can await the re-render flushing the new
    // gate closure before pressing (RNTL 14 / React 19 flush asynchronously).
    return (
      <Pressable testID="b" onPress={gate(fn)}>
        <Text>{online ? 'online' : 'offline'}</Text>
      </Pressable>
    );
  }
  render(<Btn />);
  await waitFor(() => expect(screen.getByText('online')).toBeTruthy());
  fireEvent.press(screen.getByTestId('b'));
  expect(fn).toHaveBeenCalledTimes(1);
  setOnline(false);
  screen.rerender(<Btn />);
  await waitFor(() => expect(screen.getByText('offline')).toBeTruthy());
  fireEvent.press(screen.getByTestId('b'));
  expect(fn).toHaveBeenCalledTimes(1);
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});
