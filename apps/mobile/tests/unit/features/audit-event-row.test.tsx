import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuditEventRow } from '@/features/audit/AuditEventRow';

const base = {
  id: 1,
  occurredAt: '2026-05-26T17:42:00Z',
  actor: { userId: 2, username: 'sofia', role: 'user' as const },
  verb: 'create' as const,
  action: 'added series',
  target: 'series:vinland-saga',
  diff: '+ monitored',
};

it('renders the verb badge', async () => {
  await render(
    <ThemeProvider>
      <AuditEventRow event={base} />
    </ThemeProvider>,
  );
  expect(screen.getByText('CREATE')).toBeTruthy();
  expect(screen.getByText('added series')).toBeTruthy();
});

it('renders unauthenticated actor as "unknown"', async () => {
  await render(
    <ThemeProvider>
      <AuditEventRow event={{ ...base, id: 9, actor: null }} />
    </ThemeProvider>,
  );
  expect(screen.getByText(/unknown/i)).toBeTruthy();
});

it('renders a delete verb with destructive color treatment', async () => {
  await render(
    <ThemeProvider>
      <AuditEventRow
        event={{ ...base, verb: 'delete', action: 'removed indexer', diff: '- enabled' }}
      />
    </ThemeProvider>,
  );
  expect(screen.getByText('DELETE')).toBeTruthy();
});
