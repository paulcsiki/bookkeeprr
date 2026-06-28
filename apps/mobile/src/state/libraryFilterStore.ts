import { create } from 'zustand';
import type { ContentType } from '@/api/schemas';

// HEALTH (formerly `status`) — server-reported per-series fulfilment state.
export type LibraryHealth = 'all' | 'complete' | 'missing' | 'downloading' | 'error';
// READING — derived from per-series readState plus an "unfinished" rollup
// (anything that is not fully finished, i.e. unread or in progress).
export type LibraryRead = 'all' | 'unfinished' | 'unread' | 'reading' | 'finished';
// MONITORING — whether bookkeeprr is actively watching for releases.
export type LibraryMon = 'all' | 'monitored' | 'unmonitored';
export type LibrarySort =
  | 'added_at:desc'
  | 'added_at:asc'
  | 'title:asc'
  | 'volumes:desc'
  | 'progress:asc';
export type LibraryView = 'grid' | 'list';

interface LibraryFilterState {
  contentTypes: ContentType[];
  read: LibraryRead;
  mon: LibraryMon;
  health: LibraryHealth;
  sort: LibrarySort;
  view: LibraryView;
  toggleContentType: (t: ContentType) => void;
  setContentTypes: (t: ContentType[]) => void;
  setRead: (r: LibraryRead) => void;
  setMon: (m: LibraryMon) => void;
  setHealth: (h: LibraryHealth) => void;
  setSort: (s: LibrarySort) => void;
  setView: (v: LibraryView) => void;
  reset: () => void;
  isFiltered: () => boolean;
}

const DEFAULTS = {
  contentTypes: [] as ContentType[],
  read: 'all' as LibraryRead,
  mon: 'all' as LibraryMon,
  health: 'all' as LibraryHealth,
  sort: 'added_at:desc' as LibrarySort,
  view: 'grid' as LibraryView,
};

export const useLibraryFilter = create<LibraryFilterState>((set, get) => ({
  ...DEFAULTS,
  toggleContentType: (t) =>
    set((s) => ({
      contentTypes: s.contentTypes.includes(t)
        ? s.contentTypes.filter((x) => x !== t)
        : [...s.contentTypes, t],
    })),
  setContentTypes: (contentTypes) => set({ contentTypes }),
  setRead: (read) => set({ read }),
  setMon: (mon) => set({ mon }),
  setHealth: (health) => set({ health }),
  setSort: (sort) => set({ sort }),
  setView: (view) => set({ view }),
  reset: () => set(DEFAULTS),
  isFiltered: () => {
    const s = get();
    return (
      s.contentTypes.length > 0 ||
      s.read !== DEFAULTS.read ||
      s.mon !== DEFAULTS.mon ||
      s.health !== DEFAULTS.health ||
      s.sort !== DEFAULTS.sort
    );
  },
}));
