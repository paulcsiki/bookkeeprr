import { render, screen } from '@testing-library/react-native';
import TrustCert from '@/screens/onboarding/TrustCert';
import { ThemeProvider } from '@/theme/ThemeProvider';

it('shows the fingerprint and a Trust action', async () => {
  await render(
    <ThemeProvider>
      <TrustCert />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('cert-fingerprint')).toBeTruthy();
  expect(screen.getByTestId('btn-trust')).toBeTruthy();
});
