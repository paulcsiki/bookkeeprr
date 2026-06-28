import { render, screen, fireEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { DownloadRow } from '@/features/reader/DownloadRow';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const wrap = (ui: ReactElement) =>
  render(
    <ThemeProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ThemeProvider>,
  );
// render is async in @testing-library/react-native v14; await wrap(...) at call sites.

const baseProps = {
  title: 'Berserk Vol. 1',
  contentType: 'manga' as const,
  hue: 12,
  bytes: 52_428_800, // 50 MB
};

it('renders the title', async () => {
  await wrap(<DownloadRow {...baseProps} />);
  expect(screen.getByText('Berserk Vol. 1')).toBeTruthy();
});

it('renders formatted size', async () => {
  await wrap(<DownloadRow {...baseProps} />);
  // 52_428_800 bytes = 50 MB
  expect(screen.getByText('50 MB')).toBeTruthy();
});

it('renders the trash button and fires onRemove', async () => {
  const onRemove = jest.fn();
  await wrap(<DownloadRow {...baseProps} onRemove={onRemove} />);
  await fireEvent.press(screen.getByTestId('dl-remove'));
  expect(onRemove).toHaveBeenCalled();
});

it('hides trash button when selectMode is active', async () => {
  const onRemove = jest.fn();
  await wrap(<DownloadRow {...baseProps} onRemove={onRemove} selectMode />);
  expect(screen.queryByTestId('dl-remove')).toBeNull();
});

it('shows checkbox in selectMode', async () => {
  await wrap(<DownloadRow {...baseProps} selectMode />);
  expect(screen.getByTestId('dl-checkbox')).toBeTruthy();
});

it('fires onToggle when row is pressed in selectMode', async () => {
  const onToggle = jest.fn();
  const { getByText } = await wrap(
    <DownloadRow {...baseProps} selectMode onToggle={onToggle} />,
  );
  await fireEvent.press(getByText('Berserk Vol. 1'));
  expect(onToggle).toHaveBeenCalled();
});

it('renders a subline when provided', async () => {
  await wrap(<DownloadRow {...baseProps} subline="unknown · not in library" />);
  expect(screen.getByText('unknown · not in library')).toBeTruthy();
});
