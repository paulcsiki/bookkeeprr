'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ReaderManifest } from '@bookkeeprr/types';
import { apiFetch } from '@/lib/api-fetch';

/** Address a readable by its volume or by a single library file. */
export type ManifestRef = { volumeId?: number; fileId?: number };

function manifestUrl(ref: ManifestRef): string {
  if (ref.volumeId != null) return `/api/reader/manifest?volumeId=${ref.volumeId}`;
  if (ref.fileId != null) return `/api/reader/manifest?fileId=${ref.fileId}`;
  throw new Error('useManifest: provide exactly one of volumeId or fileId');
}

/**
 * Fetch the {@link ReaderManifest} for a readable. Pass exactly one of
 * `volumeId` / `fileId`. Errors (404 / 415 / 403) surface via the query's
 * `error` / `isError` state.
 */
export function useManifest(ref: ManifestRef): UseQueryResult<ReaderManifest, Error> {
  const enabled = ref.volumeId != null || ref.fileId != null;
  return useQuery<ReaderManifest, Error>({
    queryKey: ['reader-manifest', ref],
    enabled,
    queryFn: async () => {
      const r = await apiFetch(manifestUrl(ref));
      if (!r.ok) {
        const detail = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<ReaderManifest>;
    },
  });
}
