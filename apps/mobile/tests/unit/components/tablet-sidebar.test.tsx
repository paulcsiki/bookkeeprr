import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { TabletSidebar } from '@/components/TabletSidebar';

it('renders item labels when expanded', async () => {
  const onNavigate = jest.fn();
  await render(
    <ThemeProvider>
      <TabletSidebar active="library" collapsed={false} onNavigate={onNavigate} />
    </ThemeProvider>,
  );
  expect(screen.getByText('Library')).toBeTruthy();
  expect(screen.getByText('Activity')).toBeTruthy();
  expect(screen.getByText('Settings')).toBeTruthy();
});

it('hides labels when collapsed', async () => {
  await render(
    <ThemeProvider>
      <TabletSidebar active="library" collapsed onNavigate={() => {}} />
    </ThemeProvider>,
  );
  expect(screen.queryByText('Library')).toBeNull();
  // icon test ids remain
  expect(screen.getByTestId('sidebar-library')).toBeTruthy();
});

it('onNavigate fires with the tapped item key', async () => {
  const onNavigate = jest.fn();
  await render(
    <ThemeProvider>
      <TabletSidebar active="library" collapsed={false} onNavigate={onNavigate} />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByTestId('sidebar-activity'));
  expect(onNavigate).toHaveBeenCalledWith('activity');
});
