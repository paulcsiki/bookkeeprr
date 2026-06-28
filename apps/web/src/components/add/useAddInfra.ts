'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import type { ContentType } from '@/server/content-type';
import type { DiscoverResult } from '@/app/api/discover/search/route';
import { buildSeriesBody } from './quick-add';
import { toSheetHit, type AddSheetTarget } from './result-adapter';
import {
  needsAudiobookResolve,
  resolveAudiobook,
  applyResolvedAudiobook,
} from './audiobook-resolve';

type QualityProfile = { id: number; name: string; isDefault?: boolean };
type RootFolder = { id: number; path: string };

// Content type → the rootfolder subdir its path lives under, mirroring the
// server's contentTypeSubdir(). manga/comic share `comics`; novel/ebook share
// `books`; audiobook uses `audiobooks`.
const SUBDIR: Record<ContentType, string> = {
  manga: 'comics',
  comic: 'comics',
  light_novel: 'books',
  ebook: 'books',
  audiobook: 'audiobooks',
};

// Mirror of the server's sanitizeForFs for quick-add path previews. Keep
// conservative — the server is the source of truth, this only needs to produce
// a non-empty, FS-safe segment that the /api/series rootPath validator accepts.
function sanitizeForFs(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
}

function pickDefaultProfile(profiles: QualityProfile[] | undefined): QualityProfile | null {
  if (!profiles || profiles.length === 0) return null;
  return profiles.find((p) => p.isDefault) ?? profiles[0]!;
}

/**
 * Resolves the on-disk root path for a manga/comic/light_novel quick-add. The
 * media root is discovered via GET /api/readarr/v1/rootfolder; we match the
 * folder whose path ends with this type's subdir and append the sanitized
 * title. ebook/audiobook derive their root server-side and never need this.
 */
function resolveRootPath(folders: RootFolder[] | undefined, result: DiscoverResult): string | null {
  const subdir = SUBDIR[result.contentType];
  const base = folders?.find(
    (f) =>
      f.path.replace(/\/+$/, '').endsWith(`/${subdir}`) ||
      f.path.replace(/\/+$/, '').endsWith(subdir),
  );
  const baseRoot = base?.path.replace(/\/+$/, '') ?? `/media/${subdir}`;
  return `${baseRoot}/${sanitizeForFs(result.title)}`;
}

export function resultKey(r: DiscoverResult): string {
  return `${r.contentType}::${r.sourceId}`;
}

/**
 * Shared "add to library" infrastructure used by both the global AddDialog and
 * the Discover detail modal. Owns the quality-profile + rootfolder queries, the
 * quick-add POST path (via `buildSeriesBody`), the per-type configure-sheet
 * target (via `toSheetHit`), and optimistic in-library tracking. Centralising
 * this keeps a single source of truth for the add flow across both surfaces.
 */
export function useAddInfra(): {
  addedKeys: Set<string>;
  addingKey: string | null;
  sheetTarget: AddSheetTarget | null;
  setSheetTarget: (t: AddSheetTarget | null) => void;
  isInLib: (r: DiscoverResult) => boolean;
  openConfigure: (r: DiscoverResult) => void | Promise<void>;
  quickAdd: (r: DiscoverResult, opts?: { groupId?: number | null }) => Promise<void>;
} {
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [sheetTarget, setSheetTarget] = useState<AddSheetTarget | null>(null);

  const profilesQuery = useQuery<QualityProfile[]>({
    queryKey: ['quality-profiles'],
    queryFn: async () => {
      const r = await apiFetch('/api/quality-profiles');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as QualityProfile[];
    },
  });

  const rootFoldersQuery = useQuery<RootFolder[]>({
    queryKey: ['readarr-rootfolders'],
    queryFn: async () => {
      const r = await apiFetch('/api/readarr/v1/rootfolder');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as RootFolder[];
    },
    staleTime: 5 * 60_000,
  });

  const isInLib = useCallback(
    (r: DiscoverResult): boolean => r.inLib || addedKeys.has(resultKey(r)),
    [addedKeys],
  );

  const openConfigure = useCallback(async (r: DiscoverResult) => {
    // NYT/LibriVox audiobook tiles have no ASIN — resolve an Audible identity
    // first, then open the configure sheet seeded with the real ASIN. Other
    // tiles (and audnex audiobooks) open the sheet directly.
    if (needsAudiobookResolve(r)) {
      // Best-effort: enrich with the Audible identity when found, otherwise open
      // the sheet with the tile's own metadata (it adds title-keyed).
      try {
        const resolved = await resolveAudiobook(r);
        setSheetTarget(toSheetHit(resolved != null ? applyResolvedAudiobook(r, resolved) : r));
      } catch {
        setSheetTarget(toSheetHit(r));
      }
      return;
    }
    setSheetTarget(toSheetHit(r));
  }, []);

  const quickAdd = useCallback(
    async (r: DiscoverResult, opts?: { groupId?: number | null }) => {
      const key = resultKey(r);
      if (isInLib(r) || addingKey != null) return;

      const profile = pickDefaultProfile(profilesQuery.data);
      if (profile == null) {
        toast.error('No quality profile — configure one to add');
        void openConfigure(r);
        return;
      }

      const needsRoot =
        r.contentType === 'manga' || r.contentType === 'comic' || r.contentType === 'light_novel';
      const rootPath = needsRoot ? resolveRootPath(rootFoldersQuery.data, r) ?? undefined : undefined;

      setAddingKey(key);
      try {
        // NYT/LibriVox audiobook tiles carry no ASIN — resolve an Audible
        // identity before building the body. A null resolve aborts with a toast.
        let toAdd = r;
        if (needsAudiobookResolve(r)) {
          // Best-effort: use the Audible identity when found, else add with the
          // tile's own metadata (title-keyed). A missing Audible match must not
          // block the add — that's the quick-add failure this fixes.
          const resolved = await resolveAudiobook(r).catch(() => null);
          if (resolved != null) toAdd = applyResolvedAudiobook(r, resolved);
        }
        const body = buildSeriesBody(toAdd, {
          qualityProfileId: profile.id,
          rootPath,
          groupId: opts?.groupId ?? null,
        });
        const resp = await apiFetch('/api/series', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const respBody = (await resp.json().catch(() => ({}))) as { error?: string };
        if (resp.status === 409) {
          setAddedKeys((s) => new Set(s).add(key));
          toast.info(`${r.title} is already in your library`);
          return;
        }
        if (!resp.ok) {
          throw new Error(respBody.error ?? `HTTP ${resp.status}`);
        }
        setAddedKeys((s) => new Set(s).add(key));
        toast.success(`Added ${r.title}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setAddingKey(null);
      }
    },
    [isInLib, addingKey, profilesQuery.data, rootFoldersQuery.data, openConfigure],
  );

  return useMemo(
    () => ({
      addedKeys,
      addingKey,
      sheetTarget,
      setSheetTarget,
      isInLib,
      openConfigure,
      quickAdd,
    }),
    [addedKeys, addingKey, sheetTarget, isInLib, openConfigure, quickAdd],
  );
}
