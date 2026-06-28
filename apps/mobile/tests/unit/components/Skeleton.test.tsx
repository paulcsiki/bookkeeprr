import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { Skeleton } from '@/components/Skeleton';

it('renders the line variant with the requested width/height', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <Skeleton testID="skel" variant="line" width={120} height={10} />
    </ThemeProvider>,
  );
  const el = getByTestId('skel');
  const styles = Array.isArray(el.props.style) ? Object.assign({}, ...el.props.style) : el.props.style;
  expect(styles.width).toBe(120);
  expect(styles.height).toBe(10);
});

it('renders the cover variant (aspect 3/4)', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <Skeleton testID="skel" variant="cover" />
    </ThemeProvider>,
  );
  const styles = Array.isArray(getByTestId('skel').props.style) ? Object.assign({}, ...getByTestId('skel').props.style) : getByTestId('skel').props.style;
  expect(styles.aspectRatio).toBe(3 / 4);
});
