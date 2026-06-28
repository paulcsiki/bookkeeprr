import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SplitView } from '@/responsive/SplitView';

it('renders both panes', async () => {
  await render(
    <ThemeProvider>
      <SplitView testID="sv" left={<Text>left pane</Text>} right={<Text>right pane</Text>} />
    </ThemeProvider>,
  );
  expect(screen.getByText('left pane')).toBeTruthy();
  expect(screen.getByText('right pane')).toBeTruthy();
});

it('places left and right with testIDs sv-left and sv-right', async () => {
  await render(
    <ThemeProvider>
      <SplitView testID="sv" left={<Text>L</Text>} right={<Text>R</Text>} />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('sv-left')).toBeTruthy();
  expect(screen.getByTestId('sv-right')).toBeTruthy();
});

it('omits left/right testIDs when no testID prop is provided', async () => {
  await render(
    <ThemeProvider>
      <SplitView left={<Text>L</Text>} right={<Text>R</Text>} />
    </ThemeProvider>,
  );
  expect(screen.queryByTestId('sv-left')).toBeNull();
  expect(screen.queryByTestId('sv-right')).toBeNull();
});
