import { render, screen } from '@testing-library/react-native';
import Welcome from '@/screens/onboarding/Welcome';
import { ThemeProvider } from '@/theme/ThemeProvider';

it('shows welcome content and primary CTA', async () => {
  await render(
    <ThemeProvider>
      <Welcome />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('screen-welcome')).toBeTruthy();
  expect(screen.getByTestId('btn-get-started')).toBeTruthy();
});
