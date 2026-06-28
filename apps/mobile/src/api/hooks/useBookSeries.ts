import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { BookSeriesListResponse, BookSeriesDetailResponse } from '@/api/schemas/book-series';
import type { BookSeriesContentTypeValue } from '@/api/schemas/book-series';

// ─── Queries ────────────────────────────────────────────────────────────────

export function useBookSeriesList(contentType?: BookSeriesContentTypeValue) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['book-series', 'list', contentType ?? null],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const qs = contentType ? `?contentType=${contentType}` : '';
      const raw = await client.get(`/api/book-series${qs}`);
      return BookSeriesListResponse.parse(raw);
    },
  });
}

export function useBookSeries(id: number | undefined) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated' && typeof id === 'number',
    queryKey: ['book-series', id],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get(`/api/book-series/${id}`);
      return BookSeriesDetailResponse.parse(raw);
    },
  });
}

/**
 * Builds a Map<seriesId, bookSeriesId> by fetching the book-series list then
 * fetching each book-series detail in parallel (React Query handles caching).
 *
 * There is no dedicated /api/book-series/memberships endpoint on mobile; this
 * hook implements the equivalent by fetching details for all book-series (typically
 * a small number). Results are cached by React Query.
 *
 * Returns { memberMap, isLoading } where memberMap maps a library seriesId to the
 * bookSeriesId it belongs to. When loading, memberMap is an empty Map.
 */
export function useBookSeriesMemberMap() {
  const { state, signOut } = useAuth();
  const listQ = useBookSeriesList();
  const bookSeriesList = listQ.data?.bookSeries ?? [];

  const detailQueries = useQueries({
    queries: bookSeriesList.map((bs) => ({
      enabled: state.status === 'authenticated',
      queryKey: ['book-series', bs.id],
      queryFn: async () => {
        if (state.status !== 'authenticated') throw new Error('unauthenticated');
        const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
        const raw = await client.get(`/api/book-series/${bs.id}`);
        return BookSeriesDetailResponse.parse(raw);
      },
    })),
  });

  const memberMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const dq of detailQueries) {
      if (dq.data) {
        const bookSeriesId = dq.data.id;
        for (const book of dq.data.books) {
          if (book.seriesId !== null) {
            map.set(book.seriesId, bookSeriesId);
          }
        }
      }
    }
    return map;
  }, [detailQueries]);

  const isLoading =
    listQ.isLoading || detailQueries.some((q) => q.isLoading && !q.data);

  return { memberMap, isLoading, bookSeriesList };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function invalidateBookSeries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['book-series'] });
  qc.invalidateQueries({ queryKey: ['library'] });
  qc.invalidateQueries({ queryKey: ['series'] });
}

/**
 * POST /api/book-series/{id}/members — assign a library series to a book series.
 * body: { seriesId, position? }
 */
export function useAssignToBookSeries() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookSeriesId,
      seriesId,
      position,
    }: {
      bookSeriesId: number;
      seriesId: number;
      position?: number | null;
    }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const body: Record<string, unknown> = { seriesId };
      if (position !== undefined) body.position = position;
      return client.post(`/api/book-series/${bookSeriesId}/members`, body);
    },
    onSuccess: () => invalidateBookSeries(qc),
  });
}

/**
 * DELETE /api/book-series/{id}/members/{seriesId} — unassign a library series.
 */
export function useRemoveFromBookSeries() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookSeriesId,
      seriesId,
    }: {
      bookSeriesId: number;
      seriesId: number;
    }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return client.delete(`/api/book-series/${bookSeriesId}/members/${seriesId}`);
    },
    onSuccess: () => invalidateBookSeries(qc),
  });
}

/**
 * POST /api/book-series/{id}/refresh — trigger detection refresh for all members.
 */
export function useRefreshBookSeries() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookSeriesId }: { bookSeriesId: number }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return client.post(`/api/book-series/${bookSeriesId}/refresh`, {});
    },
    onSuccess: () => invalidateBookSeries(qc),
  });
}
