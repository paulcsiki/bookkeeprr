import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { CheckCircle } from 'lucide-react-native';
import { EmptyState } from '@/components/EmptyState';

it('renders title, body, action; fires onAction', async () => {
  const onAction = jest.fn();
  const { getByText } = await render(
    <ThemeProvider>
      <EmptyState
        variant="primary"
        icon={CheckCircle}
        title="Add your first series"
        body="bookkeeprr will start monitoring releases."
        actionLabel="Add series"
        onAction={onAction}
      />
    </ThemeProvider>,
  );
  expect(getByText('Add your first series')).toBeTruthy();
  expect(getByText(/monitoring releases/i)).toBeTruthy();
  await fireEvent.press(getByText('Add series'));
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('renders hint when provided', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <EmptyState variant="ok" icon={CheckCircle} title="All caught up" hint="next scan 14:30" />
    </ThemeProvider>,
  );
  expect(getByText('next scan 14:30')).toBeTruthy();
});
