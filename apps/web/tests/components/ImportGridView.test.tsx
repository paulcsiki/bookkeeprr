/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── apiFetch mock ─────────────────────────────────────────────────────────────
const apiFetch = vi.fn();
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

// ── sonner mock ───────────────────────────────────────────────────────────────
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ── next/navigation mock ──────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// ── Radix Select → native <select> for jsdom testability ─────────────────────
// Radix Select uses floating-ui for positioning which doesn't work in jsdom.
// Replace with native <select>/<option> so fireEvent.change works.
// SelectTrigger and SelectValue return null — only SelectContent + SelectItem
// render inside the <select>, producing valid <option> children.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
    ...rest
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
    [k: string]: unknown;
  }) => (
    <select
      value={value ?? ''}
      onChange={(e) => onValueChange?.(e.target.value)}
      {...rest}
    >
      {children}
    </select>
  ),
  // Trigger and Value are visual chrome only — suppress them so <select>
  // contains only valid <option> children.
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

// ── Radix Checkbox → native <input type="checkbox"> for jsdom testability ────
// Uses onClick (not onChange) to mirror Radix's onCheckedChange firing on click,
// so fireEvent.click properly triggers state updates.
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked: checkedProp,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean | 'indeterminate';
    onCheckedChange?: (checked: boolean | 'indeterminate') => void;
    'aria-label'?: string;
  }) => {
    const isChecked = checkedProp === true || checkedProp === 'indeterminate';
    return (
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={isChecked}
        readOnly
        onClick={() => onCheckedChange?.(!isChecked)}
      />
    );
  },
}));

// ── component under test (imported after mocks are set up) ────────────────────
import { ImportGridView } from '@/app/(app)/library/import/ImportGridView';

// ── test fixtures ─────────────────────────────────────────────────────────────
const PROFILES = [
  { id: 1, name: 'Any' },
  { id: 2, name: 'Preferred' },
];

const CANDIDATE_1 = {
  sourceId: 'OL001W',
  title: 'The First Book',
  author: 'Author One',
  year: 2020,
  isbn: null,
  coverUrl: null,
  source: 'openlibrary' as const,
};

const CANDIDATE_2 = {
  sourceId: 'OL002W',
  title: 'The Second Book',
  author: 'Author Two',
  year: 2021,
  isbn: null,
  coverUrl: null,
  source: 'openlibrary' as const,
};

const ITEM_1 = {
  path: '/media/ebooks/Book1',
  detectedTitle: 'Book1',
  contentType: 'ebook' as const,
  files: ['/media/ebooks/Book1/book1.epub'],
  sizeBytes: 1_024_000,
  best: CANDIDATE_1,
  alternatives: [],
};

const ITEM_2 = {
  path: '/media/ebooks/Book2',
  detectedTitle: 'Book2',
  contentType: 'ebook' as const,
  files: ['/media/ebooks/Book2/book2.epub'],
  sizeBytes: 2_048_000,
  best: CANDIDATE_2,
  alternatives: [],
};

// ── helpers ───────────────────────────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeQC(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderGrid(): ReturnType<typeof render> {
  const qc = makeQC();
  return render(
    <QueryClientProvider client={qc}>
      <ImportGridView />
    </QueryClientProvider>,
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe('ImportGridView', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    // Default handler: scan returns 2 items, quality-profiles returns 2 profiles
    apiFetch.mockImplementation(async (url: string, _init?: RequestInit) => {
      if (url === '/api/library/import/scan') {
        return json({ items: [ITEM_1, ITEM_2] });
      }
      if (url === '/api/quality-profiles') {
        return json(PROFILES);
      }
      // Import adopt endpoint
      if (url === '/api/library/import') {
        return json({ imported: 2, seriesIds: [10, 11] });
      }
      return json({}, 404);
    });
  });

  it('renders both matched titles after scan resolves', async () => {
    renderGrid();
    await waitFor(() => {
      expect(screen.getByText('The First Book')).toBeTruthy();
      expect(screen.getByText('The Second Book')).toBeTruthy();
    });
  });

  it('changing bulk Quality select updates all rows; Import sends correct payload', async () => {
    renderGrid();

    // Wait for both items and profiles to render
    await waitFor(() => {
      expect(screen.getByText('The First Book')).toBeTruthy();
    });
    await waitFor(() => {
      // Quality profile options exist (both items have profile 1 by default)
      expect(screen.getByTestId('bulk-quality-select-wrapper')).toBeTruthy();
    });

    // Change bulk quality select to profile id=2
    const wrapper = screen.getByTestId('bulk-quality-select-wrapper');
    const bulkSelect = wrapper.querySelector('select')!;
    expect(bulkSelect).toBeTruthy();
    fireEvent.change(bulkSelect, { target: { value: '2' } });

    // Click the Import button (should show "Import 2 items")
    const importBtn = await waitFor(() =>
      screen.getByRole('button', { name: /Import 2 items/i }),
    );
    fireEvent.click(importBtn);

    // Verify the API call has both rows with qualityProfileId=2
    await waitFor(() => {
      const calls = (apiFetch as ReturnType<typeof vi.fn>).mock.calls as [
        string,
        RequestInit?,
      ][];
      const adoptCall = calls.find(
        ([url, opts]) => url === '/api/library/import' && opts?.method === 'POST',
      );
      expect(adoptCall).toBeTruthy();
      const body = JSON.parse((adoptCall![1] as RequestInit).body as string) as {
        rows: Array<{ qualityProfileId: number; match: { sourceId: string } }>;
      };
      expect(body.rows).toHaveLength(2);
      expect(body.rows[0]?.qualityProfileId).toBe(2);
      expect(body.rows[1]?.qualityProfileId).toBe(2);
      expect(body.rows[0]?.match.sourceId).toBe('OL001W');
      expect(body.rows[1]?.match.sourceId).toBe('OL002W');
    });
  });

  it('unchecking a row excludes it from the import payload', async () => {
    renderGrid();

    // Wait for items AND checkedPaths seeding effect — "Import 2 items" proves both
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import 2 items/i })).toBeTruthy();
    });

    // All per-row checkboxes: index 0 = select-all, 1 = ITEM_1, 2 = ITEM_2
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(3); // select-all + 2 rows

    // Uncheck ITEM_2 (index 2) — fireEvent.click calls onCheckedChange(!current)
    fireEvent.click(checkboxes[2]!);

    // Import button should now say "Import 1 item"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import 1 item$/i })).toBeTruthy();
    });

    // Click Import
    fireEvent.click(screen.getByRole('button', { name: /Import 1 item$/i }));

    // Verify only ITEM_1 is in the payload
    await waitFor(() => {
      const calls = (apiFetch as ReturnType<typeof vi.fn>).mock.calls as [
        string,
        RequestInit?,
      ][];
      const adoptCall = calls.find(
        ([url, opts]) => url === '/api/library/import' && opts?.method === 'POST',
      );
      expect(adoptCall).toBeTruthy();
      const body = JSON.parse((adoptCall![1] as RequestInit).body as string) as {
        rows: Array<{ match: { sourceId: string } }>;
      };
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]?.match.sourceId).toBe('OL001W');
    });
  });

  it('select-all checkbox toggles all rows on and off', async () => {
    renderGrid();

    // Wait for items AND checkedPaths seeding — "Import 2 items" proves both ready
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import 2 items/i })).toBeTruthy();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    const selectAll = checkboxes[0]!;

    // Uncheck all via select-all — click calls onCheckedChange(!current)
    fireEvent.click(selectAll);

    await waitFor(() => {
      // Import button should be disabled (0 importable rows)
      const btn = screen.getByRole('button', { name: /Import 0 items/i });
      expect(btn).toBeTruthy();
    });

    // Re-check all via select-all (currently unchecked → click checks all)
    fireEvent.click(selectAll);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import 2 items/i })).toBeTruthy();
    });
  });

  it('bulk quality applies only to checked rows; unchecked row keeps original quality', async () => {
    renderGrid();

    // Wait for items AND checkedPaths seeding — "Import 2 items" proves both ready
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import 2 items/i })).toBeTruthy();
    });

    // Uncheck ITEM_2 — fireEvent.click calls onCheckedChange(!current)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[2]!);

    // Apply bulk quality = 2 (should only affect ITEM_1)
    const wrapper = screen.getByTestId('bulk-quality-select-wrapper');
    const bulkSelect = wrapper.querySelector('select')!;
    fireEvent.change(bulkSelect, { target: { value: '2' } });

    // Import (only ITEM_1 is checked)
    const importBtn = await waitFor(() =>
      screen.getByRole('button', { name: /Import 1 item$/i }),
    );
    fireEvent.click(importBtn);

    // Verify only ITEM_1 is imported with qualityProfileId=2
    await waitFor(() => {
      const calls = (apiFetch as ReturnType<typeof vi.fn>).mock.calls as [
        string,
        RequestInit?,
      ][];
      const adoptCall = calls.find(
        ([url, opts]) => url === '/api/library/import' && opts?.method === 'POST',
      );
      expect(adoptCall).toBeTruthy();
      const body = JSON.parse((adoptCall![1] as RequestInit).body as string) as {
        rows: Array<{ qualityProfileId: number; match: { sourceId: string } }>;
      };
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]?.qualityProfileId).toBe(2);
      expect(body.rows[0]?.match.sourceId).toBe('OL001W');
    });
  });
});
