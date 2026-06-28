import { useLibraryFilter } from '@/state/libraryFilterStore';

beforeEach(() => useLibraryFilter.getState().reset());

it('starts with sane defaults', () => {
  const s = useLibraryFilter.getState();
  expect(s.contentTypes).toEqual([]);
  expect(s.read).toBe('all');
  expect(s.mon).toBe('all');
  expect(s.health).toBe('all');
  expect(s.sort).toBe('added_at:desc');
});

it('toggleContentType adds and removes a type', () => {
  useLibraryFilter.getState().toggleContentType('manga');
  expect(useLibraryFilter.getState().contentTypes).toEqual(['manga']);
  useLibraryFilter.getState().toggleContentType('manga');
  expect(useLibraryFilter.getState().contentTypes).toEqual([]);
});

it('setRead / setMon / setHealth / setSort update values', () => {
  useLibraryFilter.getState().setRead('finished');
  expect(useLibraryFilter.getState().read).toBe('finished');
  useLibraryFilter.getState().setMon('unmonitored');
  expect(useLibraryFilter.getState().mon).toBe('unmonitored');
  useLibraryFilter.getState().setHealth('missing');
  expect(useLibraryFilter.getState().health).toBe('missing');
  useLibraryFilter.getState().setSort('title:asc');
  expect(useLibraryFilter.getState().sort).toBe('title:asc');
});

it('reset returns to defaults', () => {
  const s = useLibraryFilter.getState();
  s.toggleContentType('manga');
  s.setRead('reading');
  s.setMon('monitored');
  s.setHealth('complete');
  s.setSort('title:asc');
  s.reset();
  const after = useLibraryFilter.getState();
  expect(after.contentTypes).toEqual([]);
  expect(after.read).toBe('all');
  expect(after.mon).toBe('all');
  expect(after.health).toBe('all');
  expect(after.sort).toBe('added_at:desc');
});

it('isFiltered reflects non-default state', () => {
  expect(useLibraryFilter.getState().isFiltered()).toBe(false);
  useLibraryFilter.getState().setRead('finished');
  expect(useLibraryFilter.getState().isFiltered()).toBe(true);
  useLibraryFilter.getState().reset();
  useLibraryFilter.getState().setHealth('missing');
  expect(useLibraryFilter.getState().isFiltered()).toBe(true);
});
