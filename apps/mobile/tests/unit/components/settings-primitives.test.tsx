import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Settings as SettingsIcon } from 'lucide-react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SettingsSection } from '@/components/SettingsSection';
import { SettingsRow } from '@/components/SettingsRow';
import { Toggle } from '@/components/Toggle';

it('SettingsSection renders label + children', async () => {
  await render(
    <ThemeProvider>
      <SettingsSection label="LIBRARY">
        <Text>child</Text>
      </SettingsSection>
    </ThemeProvider>,
  );
  expect(screen.getByText('LIBRARY')).toBeTruthy();
  expect(screen.getByText('child')).toBeTruthy();
});

it('SettingsRow renders name + sub + value', async () => {
  await render(
    <ThemeProvider>
      <SettingsRow icon={SettingsIcon} name="Naming" sub="{SERIES} - v{VOL:2}" value="default" />
    </ThemeProvider>,
  );
  expect(screen.getByText('Naming')).toBeTruthy();
  expect(screen.getByText('default')).toBeTruthy();
});

it('SettingsRow fires onPress', async () => {
  const onPress = jest.fn();
  await render(
    <ThemeProvider>
      <SettingsRow icon={SettingsIcon} name="x" onPress={onPress} testID="row-x" />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByTestId('row-x'));
  expect(onPress).toHaveBeenCalled();
});

it('Toggle fires onChange', async () => {
  const onChange = jest.fn();
  await render(
    <ThemeProvider>
      <Toggle on={false} onChange={onChange} testID="t" />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByTestId('t'));
  expect(onChange).toHaveBeenCalledWith(true);
});
