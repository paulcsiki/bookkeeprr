import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { NetworkErrorScreen } from '@/features/system/NetworkErrorScreen';

it('renders retry, fires onRetry', async () => {
  const onRetry = jest.fn();
  const { getByTestId } = await render(
    <ThemeProvider>
      <NetworkErrorScreen onRetry={onRetry} />
    </ThemeProvider>,
  );
  await fireEvent.press(getByTestId('btn-net-retry'));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('renders View cached when cachedCount > 0', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <NetworkErrorScreen cachedCount={42} onRetry={jest.fn()} onViewCached={jest.fn()} />
    </ThemeProvider>,
  );
  expect(getByTestId('btn-net-cached')).toBeTruthy();
});
