import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) };
});

const mockSearch = jest.fn();
const mockAddMutate = jest.fn();
jest.mock('@/api/hooks', () => ({
  useSearchSeries: () => mockSearch(),
  useAddSeries: () => ({ mutate: mockAddMutate, isPending: false }),
  useLibraryGroups: () => ({ data: { groups: [] } }),
}));

import AddSeries from '@/screens/library/AddSeries';

const RESULT = {
  sourceId: 'src-7', title: 'Berserk', contentType: 'manga' as const,
  author: 'Miura', year: 1989, inLibrary: false,
};
function setOffline() { useConnectivity.setState({ deviceOnline: false, serverReachable: false }); }
function renderAdd() { return render(<ThemeProvider><AddSeries /></ThemeProvider>); }

beforeEach(() => {
  mockAddMutate.mockClear();
  useToasts.setState({ toasts: [] });
  mockSearch.mockReturnValue({ data: { results: [RESULT], tookMs: 5 }, isLoading: false, isError: false, isFetching: false });
});

it('offline: Add row is disabled and the mutation does not fire + toasts', async () => {
  setOffline();
  renderAdd();
  await waitFor(() => expect(screen.getByTestId('input-add-search')).toBeTruthy());
  // Type to surface a result row.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('input-add-search'), 'berserk');
  });
  await waitFor(() => expect(screen.getByTestId('btn-add-src-7')).toBeTruthy());
  const btn = screen.getByTestId('btn-add-src-7');
  expect(btn.props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(btn);
  expect(mockAddMutate).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('online: Add fires the mutation (no regression)', async () => {
  renderAdd();
  await waitFor(() => expect(screen.getByTestId('input-add-search')).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('input-add-search'), 'berserk');
  });
  await waitFor(() => expect(screen.getByTestId('btn-add-src-7')).toBeTruthy());
  fireEvent.press(screen.getByTestId('btn-add-src-7'));
  expect(mockAddMutate).toHaveBeenCalledTimes(1);
});
