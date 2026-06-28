import { applyLibraryFilters } from '@/features/library/applyFilters';
import type { SeriesSummary } from '@/api/schemas';

function row(p: Partial<SeriesSummary> & Pick<SeriesSummary, 'id'>): SeriesSummary {
  return {
    title: `Series ${p.id}`,
    contentType: 'manga',
    coverUrl: null,
    monitored: true,
    volumes: 10,
    downloaded: 5,
    readState: null,
    health: null,
    groupId: null,
    groupPath: '',
    ...p,
  };
}

const rows: SeriesSummary[] = [
  row({ id: 1, readState: 'reading', health: 'missing', monitored: true, contentType: 'manga' }),
  row({ id: 2, readState: 'finished', health: 'complete', monitored: true, contentType: 'manga' }),
  row({ id: 3, readState: 'unread', health: 'error', monitored: false, contentType: 'novel' }),
  row({
    id: 4,
    readState: 'reading',
    health: 'downloading',
    monitored: false,
    contentType: 'comic',
  }),
];

const base = { contentTypes: [] as SeriesSummary['contentType'][], read: 'all', mon: 'all', health: 'all' } as const;

it('passes everything through with all facets at "all"', () => {
  expect(applyLibraryFilters(rows, base).map((r) => r.id)).toEqual([1, 2, 3, 4]);
});

it("read='finished' keeps only finished rows", () => {
  expect(applyLibraryFilters(rows, { ...base, read: 'finished' }).map((r) => r.id)).toEqual([2]);
});

it("read='unfinished' hides finished rows", () => {
  expect(applyLibraryFilters(rows, { ...base, read: 'unfinished' }).map((r) => r.id)).toEqual([
    1, 3, 4,
  ]);
});

it("read='reading' keeps in-progress rows", () => {
  expect(applyLibraryFilters(rows, { ...base, read: 'reading' }).map((r) => r.id)).toEqual([1, 4]);
});

it("health='missing' hides complete rows", () => {
  expect(applyLibraryFilters(rows, { ...base, health: 'missing' }).map((r) => r.id)).toEqual([1]);
});

it("health='downloading' keeps only downloading rows", () => {
  expect(applyLibraryFilters(rows, { ...base, health: 'downloading' }).map((r) => r.id)).toEqual([
    4,
  ]);
});

it("mon='unmonitored' hides monitored rows", () => {
  expect(applyLibraryFilters(rows, { ...base, mon: 'unmonitored' }).map((r) => r.id)).toEqual([
    3, 4,
  ]);
});

it("mon='monitored' keeps only monitored rows", () => {
  expect(applyLibraryFilters(rows, { ...base, mon: 'monitored' }).map((r) => r.id)).toEqual([1, 2]);
});

it('combines content type + read + health + mon', () => {
  expect(
    applyLibraryFilters(rows, {
      contentTypes: ['manga'],
      read: 'unfinished',
      mon: 'monitored',
      health: 'missing',
    }).map((r) => r.id),
  ).toEqual([1]);
});

it('falls back to volume counts when readState/health omitted', () => {
  const legacy: SeriesSummary[] = [
    row({ id: 10, readState: null, health: null, volumes: 10, downloaded: 10 }),
    row({ id: 11, readState: null, health: null, volumes: 10, downloaded: 3 }),
    row({ id: 12, readState: null, health: null, volumes: 10, downloaded: 0 }),
  ];
  expect(applyLibraryFilters(legacy, { ...base, read: 'finished' }).map((r) => r.id)).toEqual([10]);
  expect(applyLibraryFilters(legacy, { ...base, read: 'unread' }).map((r) => r.id)).toEqual([12]);
  expect(applyLibraryFilters(legacy, { ...base, health: 'complete' }).map((r) => r.id)).toEqual([
    10,
  ]);
});
