/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LibraryView } from '@/app/(app)/library/LibraryView';
import { AddDialogProvider } from '@/components/add/AddDialogProvider';

// The add dialog (rendered by AddDialogProvider) calls useRouter; stub navigation.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => '/library',
  useSearchParams: () => new URLSearchParams(),
}));

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <AddDialogProvider>{ui}</AddDialogProvider>
    </QueryClientProvider>,
  );
}

describe('LibraryView (empty)', () => {
  it('renders the EmptyState with an Add-series button that opens the add dialog', () => {
    renderWithProviders(<LibraryView series={[]} />);
    expect(screen.getByText(/library is empty/i)).toBeTruthy();
    // The empty-state CTA now opens the Add-to-library dialog (a button, not a link).
    expect(screen.getByRole('button', { name: /add series/i })).toBeTruthy();
  });
});
