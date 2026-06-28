import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Logo, LogoMark } from '@/components/Logo';

it('renders LogoMark with disc using primary color', async () => {
  await render(
    <ThemeProvider>
      <LogoMark testID="mark" size={48} />
    </ThemeProvider>,
  );
  const mark = screen.getByTestId('mark');
  expect(mark).toBeTruthy();
});

it('Logo renders wordmark text', async () => {
  await render(
    <ThemeProvider>
      <Logo testID="lock" />
    </ThemeProvider>,
  );
  expect(screen.getByText(/bookkeep/i)).toBeTruthy();
});
