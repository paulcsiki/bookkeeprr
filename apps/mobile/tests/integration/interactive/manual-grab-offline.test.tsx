import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

const mockGrabMutate = jest.fn();
jest.mock('@/api/hooks', () => ({
  useManualGrab: () => ({ mutate: mockGrabMutate, isPending: false }),
  manualGrabErrorMessage: () => 'err',
}));

import { ManualGrabSheet } from '@/features/interactive/ManualGrabSheet';

const MAGNET = 'magnet:?xt=urn:btih:abc';
function setOffline() {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
}
function renderSheet() {
  return render(
    <ThemeProvider>
      <ManualGrabSheet seriesId={7} onClose={jest.fn()} onGrabbed={jest.fn()} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockGrabMutate.mockClear();
  useToasts.setState({ toasts: [] });
});

it('offline: submit is disabled, does not mutate, toasts', async () => {
  setOffline();
  renderSheet();
  await waitFor(() => expect(screen.getByTestId('input-magnet')).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('input-magnet'), MAGNET);
  });
  const submit = screen.getByTestId('manual-grab-submit');
  expect(submit.props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(submit);
  expect(mockGrabMutate).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('online: submit fires the mutation (no regression)', async () => {
  renderSheet();
  await waitFor(() => expect(screen.getByTestId('input-magnet')).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('input-magnet'), MAGNET);
  });
  fireEvent.press(screen.getByTestId('manual-grab-submit'));
  expect(mockGrabMutate).toHaveBeenCalledTimes(1);
});
