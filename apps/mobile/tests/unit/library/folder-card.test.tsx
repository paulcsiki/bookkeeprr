import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FolderCard } from '@/features/library/groups/FolderCard';
import type { GroupNode } from '@/features/library/groups/lib';

function makeGroup(overrides: Partial<GroupNode> = {}): GroupNode {
  return {
    id: 7,
    name: 'Shonen',
    parentId: null,
    path: 'Shonen',
    seriesCount: 14,
    subgroupCount: 2,
    ...overrides,
  };
}

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

it('renders name + plural counts subline with the default testID', async () => {
  await wrap(<FolderCard group={makeGroup()} fanSeries={[]} onPress={() => {}} />);
  expect(screen.getByTestId('folder-card-7')).toBeTruthy();
  expect(screen.getByText('Shonen')).toBeTruthy();
  expect(screen.getByText('2 FOLDERS · 14 SERIES')).toBeTruthy();
});

it('uses singular FOLDER and omits the part at zero subgroups', async () => {
  await wrap(
    <FolderCard
      group={makeGroup({ subgroupCount: 1, seriesCount: 3 })}
      fanSeries={[]}
      onPress={() => {}}
    />,
  );
  expect(screen.getByText('1 FOLDER · 3 SERIES')).toBeTruthy();

  await wrap(
    <FolderCard
      group={makeGroup({ id: 8, subgroupCount: 0, seriesCount: 5 })}
      fanSeries={[]}
      onPress={() => {}}
    />,
  );
  expect(screen.getByText('5 SERIES')).toBeTruthy();
});

it('renders at most three fan covers', async () => {
  await wrap(
    <FolderCard
      group={makeGroup()}
      fanSeries={[
        { id: 1, coverUrl: null },
        { id: 2, coverUrl: 'https://example.com/c2.jpg' },
        { id: 3, coverUrl: null },
        { id: 4, coverUrl: null },
      ]}
      onPress={() => {}}
    />,
  );
  expect(screen.getByTestId('folder-fan-1')).toBeTruthy();
  expect(screen.getByTestId('folder-fan-2')).toBeTruthy();
  expect(screen.getByTestId('folder-fan-3')).toBeTruthy();
  expect(screen.queryByTestId('folder-fan-4')).toBeNull();
});

it('idle state has no drop hint', async () => {
  await wrap(
    <FolderCard group={makeGroup()} fanSeries={[]} dropState="idle" onPress={() => {}} />,
  );
  expect(screen.queryByText('DROP TO MOVE HERE')).toBeNull();
});

it('hot state shows the mono drop hint', async () => {
  await wrap(
    <FolderCard group={makeGroup()} fanSeries={[]} dropState="hot" onPress={() => {}} />,
  );
  expect(screen.getByText('DROP TO MOVE HERE')).toBeTruthy();
});

it('fires onPress and onLongPress', async () => {
  const onPress = jest.fn();
  const onLongPress = jest.fn();
  await wrap(
    <FolderCard
      group={makeGroup()}
      fanSeries={[]}
      onPress={onPress}
      onLongPress={onLongPress}
    />,
  );
  fireEvent.press(screen.getByTestId('folder-card-7'));
  expect(onPress).toHaveBeenCalledTimes(1);
  fireEvent(screen.getByTestId('folder-card-7'), 'longPress');
  expect(onLongPress).toHaveBeenCalledTimes(1);
});
