import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { GroupRow } from '@/features/library/groups/GroupRow';
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

it('renders name + plural counts subline', async () => {
  await wrap(
    <GroupRow group={makeGroup()} fanSeries={[]} onPress={() => {}} testID="group-row-7" />,
  );
  expect(screen.getByText('Shonen')).toBeTruthy();
  expect(screen.getByText('2 FOLDERS · 14 SERIES')).toBeTruthy();
});

it('uses singular FOLDER at exactly one subgroup', async () => {
  await wrap(
    <GroupRow
      group={makeGroup({ subgroupCount: 1, seriesCount: 3 })}
      fanSeries={[]}
      onPress={() => {}}
    />,
  );
  expect(screen.getByText('1 FOLDER · 3 SERIES')).toBeTruthy();
});

it('omits the folders part at zero subgroups', async () => {
  await wrap(
    <GroupRow
      group={makeGroup({ subgroupCount: 0, seriesCount: 5 })}
      fanSeries={[]}
      onPress={() => {}}
    />,
  );
  expect(screen.getByText('5 SERIES')).toBeTruthy();
  expect(screen.queryByText(/FOLDER/)).toBeNull();
});

it('renders at most two fan covers', async () => {
  await wrap(
    <GroupRow
      group={makeGroup()}
      fanSeries={[
        { id: 1, coverUrl: null },
        { id: 2, coverUrl: null },
        { id: 3, coverUrl: null },
      ]}
      onPress={() => {}}
    />,
  );
  expect(screen.getByTestId('group-fan-1')).toBeTruthy();
  expect(screen.getByTestId('group-fan-2')).toBeTruthy();
  expect(screen.queryByTestId('group-fan-3')).toBeNull();
});

it('press + long-press fire their handlers', async () => {
  const onPress = jest.fn();
  const onLongPress = jest.fn();
  await wrap(
    <GroupRow
      group={makeGroup()}
      fanSeries={[]}
      onPress={onPress}
      onLongPress={onLongPress}
      testID="group-row-7"
    />,
  );
  await fireEvent.press(screen.getByTestId('group-row-7'));
  expect(onPress).toHaveBeenCalledTimes(1);
  await fireEvent(screen.getByTestId('group-row-7'), 'longPress');
  expect(onLongPress).toHaveBeenCalledTimes(1);
});
