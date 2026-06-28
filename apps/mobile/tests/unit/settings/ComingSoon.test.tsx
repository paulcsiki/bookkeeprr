// apps/mobile/tests/unit/settings/ComingSoon.test.tsx
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ComingSoon } from '@/features/settings/ComingSoon';

it('renders the section label and a coming-soon note', async () => {
  await render(
    <ThemeProvider>
      <ComingSoon title="Indexers" />
    </ThemeProvider>,
  );
  expect(screen.getByText('Indexers')).toBeTruthy();
  expect(screen.getByTestId('coming-soon')).toBeTruthy();
});
