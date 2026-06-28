import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ReleaseRow } from '@/features/interactive/ReleaseRow';

const baseRelease = {
  releaseId: 9,
  indexer: 'NYAA',
  title: 'Vinland.Saga.v28.[Stevenmagnet].cbz',
  sizeBytes: 333_447_168,
  seeders: 12,
  leechers: 3,
  publishedAt: '2026-05-25T20:00:00Z',
  quality: 'CBZ · HQ',
  recommended: true,
  accepted: true,
  rejectionReason: null,
  grabUrl: null,
};

it('renders accepted release with Grab button', async () => {
  const onGrab = jest.fn();
  await render(
    <ThemeProvider>
      <ReleaseRow release={baseRelease} onGrab={onGrab} grabbing={false} />
    </ThemeProvider>,
  );
  await fireEvent.press(screen.getByTestId('btn-grab-9'));
  expect(onGrab).toHaveBeenCalled();
});

it('renders rejected release dimmed with Override action', async () => {
  const onGrab = jest.fn();
  await render(
    <ThemeProvider>
      <ReleaseRow
        release={{
          ...baseRelease,
          releaseId: 12,
          accepted: false,
          recommended: false,
          rejectionReason: 'language not in quality profile',
        }}
        onGrab={onGrab}
        grabbing={false}
      />
    </ThemeProvider>,
  );
  expect(screen.getByText(/language not in quality profile/)).toBeTruthy();
  expect(
    screen.getByTestId('btn-grab-12').props.accessibilityLabel || screen.getByText('Override'),
  ).toBeTruthy();
});
