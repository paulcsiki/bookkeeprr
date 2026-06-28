import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Spinner } from '@/components/Spinner';

function wrap(children: React.ReactNode) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('Spinner', () => {
  it('renders the default (small) spinner', async () => {
    const { getByTestId } = await render(
      wrap(<Spinner testID="spinner" />),
    );
    expect(getByTestId('spinner')).toBeTruthy();
  });

  it('renders the large spinner when size="lg"', async () => {
    const { getByTestId } = await render(
      wrap(<Spinner size="lg" testID="spinner" />),
    );
    expect(getByTestId('spinner').props.size).toBe('large');
  });
});
