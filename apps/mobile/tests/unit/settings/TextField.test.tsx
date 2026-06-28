// apps/mobile/tests/unit/settings/TextField.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { TextField } from '@/components/TextField';

const wrap = (ui: ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

it('renders label and value', async () => {
  await wrap(<TextField testID="f" label="Issuer" value="https://x" onChangeText={() => {}} />);
  expect(screen.getByText('Issuer')).toBeTruthy();
  expect(screen.getByTestId('f').props.value).toBe('https://x');
});

it('fires onChangeText', async () => {
  const onChange = jest.fn();
  await wrap(<TextField testID="f" label="Issuer" value="" onChangeText={onChange} />);
  await fireEvent.changeText(screen.getByTestId('f'), 'abc');
  expect(onChange).toHaveBeenCalledWith('abc');
});

it('shows an error message', async () => {
  await wrap(<TextField testID="f" label="Issuer" value="" onChangeText={() => {}} error="required" />);
  expect(screen.getByText('required')).toBeTruthy();
});

it('shows helper text when no error', async () => {
  await wrap(<TextField testID="f" label="Issuer" value="" onChangeText={() => {}} helper="The OIDC discovery URL" />);
  expect(screen.getByText('The OIDC discovery URL')).toBeTruthy();
});
