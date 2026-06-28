import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ChangelogModal } from '@/features/updates/ChangelogModal';

const entry = {
  version: '0.1.0',
  date: '2026.05.26',
  summary: 'first release',
  sections: [{ kind: 'feat' as const, label: 'Added', items: ['onboarding'] }],
};

it('renders hero + sections + Got it CTA', async () => {
  const onDismiss = jest.fn();
  await render(
    <ThemeProvider>
      <ChangelogModal entry={entry} previousVersion={null} onDismiss={onDismiss} />
    </ThemeProvider>,
  );
  expect(screen.getByText("What's new")).toBeTruthy();
  expect(screen.getByText('UPDATE INSTALLED')).toBeTruthy();
  expect(screen.getByText('onboarding')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('btn-changelog-dismiss'));
  expect(onDismiss).toHaveBeenCalled();
});

it('shows "upgraded from vX" line when previousVersion is set', async () => {
  await render(
    <ThemeProvider>
      <ChangelogModal entry={entry} previousVersion="0.0.9" onDismiss={() => {}} />
    </ThemeProvider>,
  );
  expect(screen.getByText(/upgraded from/i)).toBeTruthy();
  expect(screen.getByText(/v0\.0\.9/)).toBeTruthy();
});
