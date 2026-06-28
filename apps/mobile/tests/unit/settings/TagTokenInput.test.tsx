// apps/mobile/tests/unit/settings/TagTokenInput.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { TagTokenInput } from '@/components/TagTokenInput';

const wrap = (ui: ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

function Harness({ initial = [] as string[] }) {
  const [v, setV] = useState<string[]>(initial);
  return <TagTokenInput testID="tags" label="Scopes" value={v} onChange={setV} />;
}

it('renders existing tokens as chips', async () => {
  await wrap(<TagTokenInput testID="tags" label="Scopes" value={['openid', 'email']} onChange={() => {}} />);
  expect(screen.getByText('openid')).toBeTruthy();
  expect(screen.getByText('email')).toBeTruthy();
});

it('commits a token on submit', async () => {
  await wrap(<Harness />);
  await fireEvent.changeText(screen.getByTestId('tags-input'), 'profile');
  await fireEvent(screen.getByTestId('tags-input'), 'submitEditing', { nativeEvent: { text: 'profile' } });
  expect(screen.getByText('profile')).toBeTruthy();
});

it('commits a token when a comma is typed', async () => {
  await wrap(<Harness />);
  await fireEvent.changeText(screen.getByTestId('tags-input'), 'groups,');
  expect(screen.getByText('groups')).toBeTruthy();
});

it('removes a token when its chip is pressed', async () => {
  await wrap(<Harness initial={['openid', 'email']} />);
  await fireEvent.press(screen.getByTestId('tags-chip-openid'));
  expect(screen.queryByText('openid')).toBeNull();
  expect(screen.getByText('email')).toBeTruthy();
});
