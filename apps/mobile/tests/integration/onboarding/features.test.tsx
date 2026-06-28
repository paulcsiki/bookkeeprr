import { render, screen } from '@testing-library/react-native';
import Features from '@/screens/onboarding/Features';
import { ThemeProvider } from '@/theme/ThemeProvider';

it('renders all four features', async () => {
  await render(
    <ThemeProvider>
      <Features />
    </ThemeProvider>,
  );
  expect(screen.getByText('Library')).toBeTruthy();
  expect(screen.getByText('Add series')).toBeTruthy();
  expect(screen.getByText('Auto-grab')).toBeTruthy();
  expect(screen.getByText('Activity & notifications')).toBeTruthy();
});
