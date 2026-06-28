import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { BottomSheet } from '@/components/BottomSheet';

it('renders children and dismisses on scrim tap', async () => {
  const onDismiss = jest.fn();
  await render(
    <ThemeProvider>
      <BottomSheet testID="sheet" onDismiss={onDismiss}>
        <Text>hello sheet</Text>
      </BottomSheet>
    </ThemeProvider>,
  );
  expect(screen.getByText('hello sheet')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('sheet-scrim'));
  expect(onDismiss).toHaveBeenCalled();
});
