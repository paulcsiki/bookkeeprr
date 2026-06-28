import { render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

it('renders the offline placeholder with the standard copy', async () => {
  render(
    <ThemeProvider>
      <SettingsOfflineState />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
  expect(screen.getByText('Offline')).toBeTruthy();
  expect(
    screen.getByText("These settings need a connection to the server. They'll load when you're back online."),
  ).toBeTruthy();
});
