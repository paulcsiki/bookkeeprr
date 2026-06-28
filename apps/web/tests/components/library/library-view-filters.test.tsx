/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LibraryView } from '@/app/(app)/library/LibraryView';
import { AddDialogProvider } from '@/components/add/AddDialogProvider';
import type { SeriesRow } from '@/server/db/schema';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
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

function makeSeries(
  id: number,
  title: string,
  monitoring: SeriesRow['monitoring'],
): SeriesRow {
  return {
    id,
    contentType: 'manga',
    titleEnglish: title,
    titleRomaji: null,
    titleNative: null,
    status: 'releasing',
    monitoring,
    totalVolumes: 10,
    addedAt: new Date(2024, 0, id),
    updatedAt: new Date(2024, 0, id),
    rootPath: `/lib/${title}`,
  } as unknown as SeriesRow;
}

// Four series:
//  1 Alpha   — monitored,   reading,  complete
//  2 Bravo   — monitored,   finished, complete
//  3 Charlie — monitored,   unread,   missing
//  4 Delta   — unmonitored, finished, missing
const SERIES = [
  makeSeries(1, 'Alpha', 'all'),
  makeSeries(2, 'Bravo', 'all'),
  makeSeries(3, 'Charlie', 'all'),
  makeSeries(4, 'Delta', 'none'),
];
const READ_STATES: [number, 'unread' | 'reading' | 'finished'][] = [
  [1, 'reading'],
  [2, 'finished'],
  [4, 'finished'],
  // 3 absent → unread
];
const HEALTH: [number, 'complete' | 'missing' | 'downloading' | 'error'][] = [
  [1, 'complete'],
  [2, 'complete'],
  [3, 'missing'],
  [4, 'missing'],
];

function renderLibrary() {
  return renderWithProviders(
    <LibraryView series={SERIES} readStates={READ_STATES} health={HEALTH} />,
  );
}

function cardTitles(): string[] {
  return Array.from(document.querySelectorAll('.lib-card .title')).map((n) => n.textContent ?? '');
}

function openFilterMenu(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /filter library/i }));
  return document.querySelector('.filter-menu-combined') as HTMLElement;
}

function clickFacetOption(menu: HTMLElement, label: string): void {
  const row = within(menu)
    .getAllByRole('menuitemradio')
    .find((el) => el.textContent?.includes(label));
  expect(row, `option "${label}" should exist`).toBeTruthy();
  fireEvent.click(row!);
}

describe('LibraryView filters', () => {
  it('shows all series with no facets active', () => {
    renderLibrary();
    expect(cardTitles().sort()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('read=finished hides unfinished series', () => {
    renderLibrary();
    const menu = openFilterMenu();
    clickFacetOption(menu, 'Finished');
    // Only Bravo + Delta are finished.
    expect(cardTitles().sort()).toEqual(['Bravo', 'Delta']);
  });

  it('health=missing hides complete series', () => {
    renderLibrary();
    const menu = openFilterMenu();
    clickFacetOption(menu, 'Missing');
    // Only Charlie + Delta are missing.
    expect(cardTitles().sort()).toEqual(['Charlie', 'Delta']);
  });

  it('mon=unmonitored keeps only unmonitored series', () => {
    renderLibrary();
    const menu = openFilterMenu();
    clickFacetOption(menu, 'Unmonitored');
    // Only Delta is unmonitored (monitoring === 'none').
    expect(cardTitles()).toEqual(['Delta']);
  });

  it('combines facets across groups (popover stays open) and clears them', () => {
    renderLibrary();
    const menu = openFilterMenu();
    // Finished AND monitored → only Bravo (Delta is unmonitored).
    clickFacetOption(menu, 'Finished');
    clickFacetOption(menu, 'Monitored');
    expect(cardTitles()).toEqual(['Bravo']);

    // Two active facets → badge count of 2.
    expect(screen.getByText('2', { selector: '.filter-count' })).toBeTruthy();

    // Clearing restores the full list.
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(cardTitles().sort()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('renders the filtered-empty state when nothing matches', () => {
    renderLibrary();
    const menu = openFilterMenu();
    // Downloading: no series has this health → empty.
    clickFacetOption(menu, 'Downloading');
    expect(cardTitles()).toEqual([]);
    expect(screen.getByText(/no series match/i)).toBeTruthy();
  });
});
