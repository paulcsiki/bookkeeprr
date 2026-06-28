import { render, fireEvent } from '@testing-library/react-native';
import { GroupPickerSheet } from '@/features/library/groups/GroupPickerSheet';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { GroupNode } from '@/features/library/groups/lib';

// Shonen (root) ⊃ Classics; Seinen (root).
// pickerOptions preorder: root, Seinen, Shonen, Shonen/Classics.
const GROUPS: GroupNode[] = [
  { id: 1, name: 'Shonen', parentId: null, path: 'Shonen', seriesCount: 2, subgroupCount: 1 },
  { id: 2, name: 'Classics', parentId: 1, path: 'Shonen / Classics', seriesCount: 1, subgroupCount: 0 },
  { id: 3, name: 'Seinen', parentId: null, path: 'Seinen', seriesCount: 0, subgroupCount: 0 },
];

async function wrap(
  value: number | null,
  onSelect: (id: number | null) => void = () => {},
  onClose: () => void = () => {},
) {
  return render(
    <ThemeProvider>
      <GroupPickerSheet
        visible
        value={value}
        groups={GROUPS}
        onSelect={onSelect}
        onClose={onClose}
      />
    </ThemeProvider>,
  );
}

it('renders the sheet with the correct testID', async () => {
  const { getByTestId } = await wrap(null);
  expect(getByTestId('group-picker-sheet')).toBeTruthy();
});

it('renders the default title "Choose group"', async () => {
  const { getByText } = await wrap(null);
  expect(getByText('Choose group')).toBeTruthy();
});

it('renders a custom title when provided', async () => {
  const { getByText } = await render(
    <ThemeProvider>
      <GroupPickerSheet
        visible
        value={null}
        groups={GROUPS}
        onSelect={() => {}}
        onClose={() => {}}
        title="Add into"
      />
    </ThemeProvider>,
  );
  expect(getByText('Add into')).toBeTruthy();
});

it('renders the root row and the depth-indented group tree', async () => {
  const { getByTestId, getByText } = await wrap(null);
  // Root row
  expect(getByTestId('picker-row-root')).toBeTruthy();
  expect(getByText('Library · no group')).toBeTruthy();
  // Tree rows — preorder DFS alphabetical: Seinen, Shonen, Shonen/Classics
  expect(getByTestId('picker-row-3')).toBeTruthy(); // Seinen
  expect(getByTestId('picker-row-1')).toBeTruthy(); // Shonen
  expect(getByTestId('picker-row-2')).toBeTruthy(); // Classics (child of Shonen)
});

it('marks the current value as selected (root)', async () => {
  const { getByTestId } = await wrap(null);
  expect(getByTestId('picker-row-root')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
  expect(getByTestId('picker-row-1')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
});

it('marks the current value as selected (group)', async () => {
  const { getByTestId } = await wrap(3);
  expect(getByTestId('picker-row-3')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
  expect(getByTestId('picker-row-root')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
});

it('calls onSelect with the id and onClose when a group row is tapped', async () => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const { getByTestId } = await wrap(null, onSelect, onClose);

  fireEvent.press(getByTestId('picker-row-1'));

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('calls onSelect(null) and onClose when the root row is tapped', async () => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const { getByTestId } = await wrap(1, onSelect, onClose);

  fireEvent.press(getByTestId('picker-row-root'));

  expect(onSelect).toHaveBeenCalledWith(null);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('renders an empty tree when groups is empty (only root row)', async () => {
  const { getByTestId, queryByTestId } = await render(
    <ThemeProvider>
      <GroupPickerSheet visible value={null} groups={[]} onSelect={() => {}} onClose={() => {}} />
    </ThemeProvider>,
  );
  expect(getByTestId('picker-row-root')).toBeTruthy();
  expect(queryByTestId('picker-row-1')).toBeNull();
});
