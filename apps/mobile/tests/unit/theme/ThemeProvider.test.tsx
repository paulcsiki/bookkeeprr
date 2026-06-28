import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { ThemeProvider, useTokens, useTheme } from '@/theme/ThemeProvider';

function Probe() {
  const tokens = useTokens();
  const { accent, scheme, setAccent, setScheme } = useTheme();
  return (
    <>
      <Text testID="primary">{tokens.primary}</Text>
      <Text testID="accent">{accent}</Text>
      <Text testID="scheme">{scheme}</Text>
      <Pressable testID="set-foxed" onPress={() => setAccent('foxed')}>
        <Text>foxed</Text>
      </Pressable>
      <Pressable testID="set-light" onPress={() => setScheme('light')}>
        <Text>light</Text>
      </Pressable>
    </>
  );
}

describe('ThemeProvider', () => {
  it('provides tokens for default accent/scheme', async () => {
    await render(
      <ThemeProvider initialAccent="tsundoku" initialScheme="dark">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('primary').props.children).toBe('hsl(263 70% 60%)');
    expect(screen.getByTestId('accent').props.children).toBe('tsundoku');
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
  });

  it('updates tokens on setAccent', async () => {
    await render(
      <ThemeProvider initialAccent="tsundoku" initialScheme="dark">
        <Probe />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('set-foxed'));
    await waitFor(() => expect(screen.getByTestId('accent').props.children).toBe('foxed'));
    // foxed maps to @bookkeeprr/tokens amber (canonical); was hsl(28 85% 58%) locally
    expect(screen.getByTestId('primary').props.children).toBe('hsl(38 82% 58%)');
  });

  it('updates tokens on setScheme', async () => {
    await render(
      <ThemeProvider initialAccent="tsundoku" initialScheme="dark">
        <Probe />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('set-light'));
    await waitFor(() => expect(screen.getByTestId('scheme').props.children).toBe('light'));
  });

  it('throws if useTokens called outside provider', async () => {
    const Bad = () => {
      useTokens();
      return null;
    };
    await expect(render(<Bad />)).rejects.toThrow(/ThemeProvider/);
  });
});
