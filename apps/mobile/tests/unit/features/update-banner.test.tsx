import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { UpdateBanner } from '@/features/updates/UpdateBanner';

it('shows current version + handles onOpenChangelog', async () => {
  const onOpenChangelog = jest.fn();
  const onDismiss = jest.fn();
  const onInstall = jest.fn();
  await render(
    <ThemeProvider>
      <UpdateBanner
        mobile="0.1.0"
        serverCurrent="0.2.0"
        onOpenChangelog={onOpenChangelog}
        onDismiss={onDismiss}
        onInstall={onInstall}
      />
    </ThemeProvider>,
  );
  expect(screen.getByText('Update available')).toBeTruthy();
  expect(screen.getByText('v0.2.0')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('btn-update-changelog'));
  expect(onOpenChangelog).toHaveBeenCalled();
});

it('dismiss fires onDismiss', async () => {
  const onDismiss = jest.fn();
  await render(
    <ThemeProvider>
      <UpdateBanner
        mobile="0.1.0"
        serverCurrent="0.2.0"
        onOpenChangelog={() => {}}
        onDismiss={onDismiss}
        onInstall={() => {}}
      />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByTestId('btn-update-dismiss'));
  expect(onDismiss).toHaveBeenCalled();
});

it('install fires onInstall', async () => {
  const onInstall = jest.fn();
  await render(
    <ThemeProvider>
      <UpdateBanner
        mobile="0.1.0"
        serverCurrent="0.2.0"
        onOpenChangelog={() => {}}
        onDismiss={() => {}}
        onInstall={onInstall}
      />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByTestId('btn-update-install'));
  expect(onInstall).toHaveBeenCalled();
});
