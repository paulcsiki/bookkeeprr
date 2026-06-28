import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ActivityTabs } from '@/features/activity/Tabs';

it('renders three tabs and fires onChange', async () => {
  const onChange = jest.fn();
  await render(
    <ThemeProvider>
      <ActivityTabs
        active="downloading"
        onChange={onChange}
        counts={{ downloading: 4, history: 142, blocked: 3 }}
      />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('tab-downloading')).toBeTruthy();
  expect(screen.getByTestId('tab-history')).toBeTruthy();
  expect(screen.getByTestId('tab-blocked')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('tab-history'));
  expect(onChange).toHaveBeenCalledWith('history');
});
