import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ChangeBadge } from '@/features/updates/ChangeBadge';
import { VersionBlock } from '@/features/updates/VersionBlock';

const sample = {
  version: '0.1.0',
  date: '2026.05.26',
  summary: 'first release',
  sections: [
    { kind: 'feat' as const, label: 'Added', items: ['onboarding', 'library'] },
    { kind: 'fix' as const, label: 'Fixed', items: ['edge case'] },
  ],
};

it('ChangeBadge renders the kind label', async () => {
  await render(
    <ThemeProvider>
      <ChangeBadge kind="feat" />
    </ThemeProvider>,
  );
  expect(screen.getByText('NEW')).toBeTruthy();
});

it('VersionBlock renders header + sections when expanded', async () => {
  await render(
    <ThemeProvider>
      <VersionBlock entry={sample} expanded />
    </ThemeProvider>,
  );
  expect(screen.getByText('v0.1.0')).toBeTruthy();
  expect(screen.getByText('first release')).toBeTruthy();
  expect(screen.getByText('onboarding')).toBeTruthy();
  expect(screen.getByText('edge case')).toBeTruthy();
});

it('VersionBlock hides sections when collapsed', async () => {
  await render(
    <ThemeProvider>
      <VersionBlock entry={sample} expanded={false} />
    </ThemeProvider>,
  );
  expect(screen.queryByText('onboarding')).toBeNull();
});

it('VersionBlock marks current version with Current pill', async () => {
  await render(
    <ThemeProvider>
      <VersionBlock entry={sample} expanded isCurrent />
    </ThemeProvider>,
  );
  expect(screen.getByText('Current')).toBeTruthy();
});
