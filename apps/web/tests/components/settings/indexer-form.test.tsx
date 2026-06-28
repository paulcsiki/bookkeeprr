/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IndexerForm } from '@/app/(app)/settings/indexers/IndexerForm';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function renderForm(ui: React.ReactElement, seed?: { key: unknown[]; data: unknown }): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Optionally pre-populate the cache to mimic a warm cache from another route.
  if (seed) qc.setQueryData(seed.key, seed.data);
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('IndexerForm — create mode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the create header and a Save button', () => {
    renderForm(<IndexerForm mode="create" />);
    expect(screen.getByText('Add indexer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('submits POST /api/indexers with the entered fields and navigates back', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    renderForm(<IndexerForm mode="create" />);

    // Minimal required fields: name + base URL (kind defaults to "nyaa").
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Nyaa' } });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://nyaa.si' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/indexers',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    // The POST body carries the entered name / baseUrl / default kind.
    const call = (apiFetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/api/indexers',
    );
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string) as {
      kind: string;
      name: string;
      baseUrl: string;
      enabled: boolean;
    };
    expect(body.kind).toBe('nyaa');
    expect(body.name).toBe('My Nyaa');
    expect(body.baseUrl).toBe('https://nyaa.si');
    expect(body.enabled).toBe(false);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/settings/indexers'));
  });
});

describe('IndexerForm — edit mode', () => {
  beforeEach(() => vi.clearAllMocks());

  const EXISTING = {
    id: 42,
    kind: 'nyaa',
    name: 'Test Nyaa',
    baseUrl: 'https://nyaa.si',
    enabled: true,
    configJson: JSON.stringify({
      kind: 'nyaa',
      queryTemplate: '{title} {extra}',
      contentTypes: ['manga'],
      categoryByContentType: { manga: '3_1' },
      pollIntervalSeconds: 900,
    }),
    lastRssAt: null,
  };

  it('loads the indexer from the query and renders its form', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    // IndexersList stores the unwrapped array under ['indexers']; the GET
    // fetcher returns the { indexers } envelope. Both must agree on shape.
    (apiFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ indexers: [EXISTING] }), { status: 200 }),
    );

    renderForm(<IndexerForm mode="edit" id={42} />);

    await waitFor(() => expect(screen.getByText('Edit Test Nyaa')).toBeTruthy());
    // The query template field is seeded from the existing config.
    expect((screen.getByLabelText('Query template') as HTMLInputElement).value).toBe(
      '{title} {extra}',
    );
  });

  it('reads a warm cache seeded by IndexersList (unwrapped array) without crashing', async () => {
    // Regression guard: IndexersList stores a bare IndexerView[] under
    // ['indexers']. IndexerForm must read that exact shape. Reading it as
    // `.indexers.find()` against a truthy array would TypeError here.
    renderForm(<IndexerForm mode="edit" id={42} />, { key: ['indexers'], data: [EXISTING] });
    await waitFor(() => expect(screen.getByText('Edit Test Nyaa')).toBeTruthy());
  });

  it('submits PATCH /api/indexers/:id and navigates back', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    (apiFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ indexers: [EXISTING] }), { status: 200 }),
    );

    renderForm(<IndexerForm mode="edit" id={42} />);
    await waitFor(() => expect(screen.getByText('Edit Test Nyaa')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/indexers/42',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/settings/indexers'));
  });
});
