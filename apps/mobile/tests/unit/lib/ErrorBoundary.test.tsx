import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ErrorBoundary } from '@/lib/ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

it('renders CrashScreen when a child throws', async () => {
  // Suppress the expected error log noise from React.
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { getByText } = await render(
    <ThemeProvider>
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    </ThemeProvider>,
  );
  expect(getByText(/Something went wrong/)).toBeTruthy();
  spy.mockRestore();
});

it('passes children through when no error', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <ErrorBoundary>
        <Text>safe child</Text>
      </ErrorBoundary>
    </ThemeProvider>,
  );
  expect(getByText('safe child')).toBeTruthy();
});
