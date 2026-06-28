import { render, screen, fireEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Button } from '@/components/Button';

const wrap = (ui: ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

it('renders label and fires onPress', async () => {
  const onPress = jest.fn();
  await wrap(<Button label="Continue" onPress={onPress} testID="btn" />);
  await fireEvent.press(screen.getByTestId('btn'));
  expect(onPress).toHaveBeenCalled();
});

it('disabled does not fire onPress', async () => {
  const onPress = jest.fn();
  await wrap(<Button label="x" onPress={onPress} disabled testID="btn" />);
  await fireEvent.press(screen.getByTestId('btn'));
  expect(onPress).not.toHaveBeenCalled();
});
