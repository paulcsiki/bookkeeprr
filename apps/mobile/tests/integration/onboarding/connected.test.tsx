import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Connected from '@/screens/onboarding/Connected';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';

it('renders success state', async () => {
  // Connected resolves the real identity via useMe (react-query), so a client
  // is required even though this test only asserts the shell renders.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ThemeProvider>
          <Connected />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByTestId('screen-connected')).toBeTruthy();
});
