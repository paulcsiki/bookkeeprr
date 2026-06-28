import type { SeriesSummary } from '@/api/schemas';
import type {
  LibraryHealth,
  LibraryMon,
  LibraryRead,
} from '@/state/libraryFilterStore';
import type { ContentType } from '@/api/schemas';

export interface LibraryFacets {
  contentTypes: ContentType[];
  read: LibraryRead;
  mon: LibraryMon;
  health: LibraryHealth;
}

// Derive a usable read-state for a row. When the server omits readState
// (older servers / partial data) we fall back to the volume counts so the
// reading facet still does something sensible.
function readStateOf(s: SeriesSummary): 'unread' | 'reading' | 'finished' {
  if (s.readState) return s.readState;
  if (s.volumes > 0 && s.downloaded >= s.volumes) return 'finished';
  if (s.downloaded > 0) return 'reading';
  return 'unread';
}

// Derive health for a row when omitted by the server, from the volume counts.
function healthOf(s: SeriesSummary): 'complete' | 'missing' | 'downloading' | 'error' {
  if (s.health) return s.health;
  return s.volumes > 0 && s.downloaded >= s.volumes ? 'complete' : 'missing';
}

function matchesRead(s: SeriesSummary, read: LibraryRead): boolean {
  if (read === 'all') return true;
  const state = readStateOf(s);
  if (read === 'unfinished') return state !== 'finished';
  return state === read;
}

function matchesMon(s: SeriesSummary, mon: LibraryMon): boolean {
  if (mon === 'all') return true;
  return mon === 'monitored' ? s.monitored : !s.monitored;
}

function matchesHealth(s: SeriesSummary, health: LibraryHealth): boolean {
  if (health === 'all') return true;
  return healthOf(s) === health;
}

// Apply every active facet to a list of rows. Content-type filtering keeps the
// existing chip-row semantics (empty selection = all types).
export function applyLibraryFilters(rows: SeriesSummary[], f: LibraryFacets): SeriesSummary[] {
  return rows.filter(
    (s) =>
      (f.contentTypes.length === 0 || f.contentTypes.includes(s.contentType)) &&
      matchesRead(s, f.read) &&
      matchesMon(s, f.mon) &&
      matchesHealth(s, f.health),
  );
}
