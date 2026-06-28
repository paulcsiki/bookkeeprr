import { render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { OfflineSection } from '@/features/system/OfflineSection';

it('renders the title and optional sub copy', async () => {
  render(
    <ThemeProvider>
      <OfflineSection title="Stats & releases are back online" sub="Reconnect to see your reading stats." />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('offline-section')).toBeTruthy());
  expect(screen.getByText('Stats & releases are back online')).toBeTruthy();
  expect(screen.getByText('Reconnect to see your reading stats.')).toBeTruthy();
});

it('renders without a sub line', async () => {
  render(
    <ThemeProvider>
      <OfflineSection title="Offline" />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('offline-section')).toBeTruthy());
  expect(screen.getByText('Offline')).toBeTruthy();
});
