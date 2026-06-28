import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { StorageMeter } from '@/features/reader/StorageMeter';

const wrap = (ui: ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);
// render is async in @testing-library/react-native v14; await wrap(...) at call sites.

const byType = { manga: 0, comic: 0, novel: 0, ebook: 0, audio: 0 };

it('renders the storage bar', async () => {
  await wrap(<StorageMeter totalBytes={0} byType={byType} />);
  expect(screen.getByTestId('storage-meter-bar')).toBeTruthy();
});

it('renders a segment for each non-zero type', async () => {
  await wrap(
    <StorageMeter
      totalBytes={10_485_760}
      byType={{ ...byType, manga: 5_242_880, audio: 5_242_880 }}
    />,
  );
  expect(screen.getByTestId('storage-segment-manga')).toBeTruthy();
  expect(screen.getByTestId('storage-segment-audio')).toBeTruthy();
  // comic, novel, ebook are zero — should not have segments
  expect(screen.queryByTestId('storage-segment-comic')).toBeNull();
});

it('shows "free" label', async () => {
  await wrap(<StorageMeter totalBytes={0} byType={byType} />);
  // 64 GB device, 0 bytes used → should show "64 GB free" label
  expect(screen.getByText(/free/i)).toBeTruthy();
});

it('shows "in downloads" label', async () => {
  await wrap(<StorageMeter totalBytes={1_048_576} byType={{ ...byType, manga: 1_048_576 }} />);
  expect(screen.getByText(/in downloads/i)).toBeTruthy();
});
