import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DownloadedRail } from '@/features/library/DownloadedRail';
import type { OfflineItem } from '@/features/reader/lib/useOfflineDownloads';

function offItem(o: Partial<OfflineItem> = {}): OfflineItem {
  return {
    readableKey: 'page_file_42',
    readableKeys: ['page_file_42'],
    volumeCount: 3,
    title: 'Berserk',
    seriesName: 'Berserk',
    contentType: 'manga',
    coverUrl: 'file:///doc/reader/page_file_42/cover.img',
    hue: 12,
    seriesId: 7,
    bytes: 2048,
    lastReadAt: 1000,
    downloadedAt: 1000,
    resolved: true,
    broken: false,
    volumes: [],
    ...o,
  };
}

function renderRail(items: OfflineItem[], onOpen = jest.fn()) {
  return {
    onOpen,
    ...render(
      <ThemeProvider>
        <DownloadedRail items={items} onOpen={onOpen} />
      </ThemeProvider>,
    ),
  };
}

it('returns null when there are no items', async () => {
  renderRail([]);
  await waitFor(() => expect(screen.queryByTestId('downloaded-rail')).toBeNull());
});

it('renders one card per item with the title and a content-type pill', async () => {
  renderRail([offItem({ readableKey: 'page_file_42', title: 'Berserk', contentType: 'manga' })]);
  await waitFor(() => expect(screen.getByTestId('downloaded-rail')).toBeTruthy());
  expect(screen.getByTestId('downloaded-card-page_file_42')).toBeTruthy();
  expect(screen.getByText('Berserk')).toBeTruthy();
  expect(screen.getByText('manga')).toBeTruthy(); // ContentTypePill text node
});

it('shows a mono volume-count sub-label', async () => {
  renderRail([offItem({ readableKey: 'page_file_42', volumeCount: 3 })]);
  await waitFor(() => expect(screen.getByText('3 VOLUMES')).toBeTruthy());
});

it('shows the singular volume label for one volume', async () => {
  renderRail([offItem({ readableKey: 'audio_vol_5', volumeCount: 1, title: 'Mistborn', contentType: 'audio' })]);
  await waitFor(() => expect(screen.getByText('1 VOLUME')).toBeTruthy());
});

it('calls onOpen with the item when a card is tapped', async () => {
  const item = offItem({ readableKey: 'page_file_42' });
  const { onOpen } = renderRail([item]);
  await waitFor(() => expect(screen.getByTestId('downloaded-card-page_file_42')).toBeTruthy());
  fireEvent.press(screen.getByTestId('downloaded-card-page_file_42'));
  expect(onOpen).toHaveBeenCalledWith(item);
});
