import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { StepDots } from '@/components/StepDots';

it('renders the right number of dots', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <StepDots current={2} total={3} testID="dots" />
    </ThemeProvider>,
  );
  const dots = getByTestId('dots');
  expect(dots.children).toHaveLength(3);
});
