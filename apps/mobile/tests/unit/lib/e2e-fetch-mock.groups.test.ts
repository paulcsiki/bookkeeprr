import { installFetchMock } from '@/lib/e2e-fetch-mock';
import { LibraryGroup, LibraryGroupsResponse, SeriesListResponse } from '@/api/schemas';

// The Maestro groups flows (tests/e2e/library/groups-*.yaml) consume these
// routes on the CI device. Validating the mock payloads against the same zod
// schemas the app parses them with catches contract drift here, where it's
// cheap, rather than in a device run.
//
// The mock is STATEFUL (creates/moves/deletes mutate module state, reset per
// Maestro flow by `clearState: true`); the tests below run as one ordered
// sequence over that state, mirroring the device flows.

const originalFetch = globalThis.fetch;

beforeAll(() => {
  installFetchMock();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

async function getGroups() {
  const res = await fetch('https://srv/api/library/groups');
  return LibraryGroupsResponse.parse(await res.json());
}

async function getSeries() {
  const res = await fetch('https://srv/api/series?page=1&limit=50');
  return SeriesListResponse.parse(await res.json());
}

describe('e2e-fetch-mock library-groups extensions', () => {
  it('GET /api/library/groups returns the schema-valid initial fixture', async () => {
    const body = await getGroups();
    const shonen = body.groups.find((g) => g.id === 1);
    expect(shonen).toMatchObject({
      name: 'Shonen',
      parentId: null,
      path: 'Shonen',
      seriesCount: 1,
      subgroupCount: 0,
    });
  });

  it('GET /api/series reflects the initial membership (series 7 in Shonen)', async () => {
    const body = await getSeries();
    const member = body.rows.find((s) => s.id === 7);
    expect(member).toMatchObject({ groupId: 1, groupPath: 'Shonen' });
    expect(body.rows.find((s) => s.id === 1)).toMatchObject({ groupId: null, groupPath: '' });
  });

  it('POST /api/library/groups creates with deterministic id 100; sibling name → 409', async () => {
    const res = await fetch('https://srv/api/library/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Backlog' }),
    });
    expect(res.status).toBe(201);
    const created = LibraryGroup.parse(await res.json());
    expect(created).toMatchObject({ id: 100, name: 'Backlog', parentId: null, path: 'Backlog' });

    const dup = await fetch('https://srv/api/library/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'backlog' }),
    });
    expect(dup.status).toBe(409);
    expect((await dup.json()) as { error: string }).toHaveProperty('error');
  });

  it('PATCH /api/library/groups/{id} renames; GET reflects it', async () => {
    const res = await fetch('https://srv/api/library/groups/100', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Up Next' }),
    });
    expect(res.status).toBe(200);
    const body = await getGroups();
    expect(body.groups.find((g) => g.id === 100)).toMatchObject({ name: 'Up Next' });
  });

  it('PATCH /api/series/{id} with groupId moves the series and updates counts', async () => {
    const res = await fetch('https://srv/api/series/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: 1 }),
    });
    expect(res.status).toBe(200);

    const series = await getSeries();
    expect(series.rows.find((s) => s.id === 1)).toMatchObject({ groupId: 1, groupPath: 'Shonen' });

    const groups = await getGroups();
    expect(groups.groups.find((g) => g.id === 1)?.seriesCount).toBe(2);
  });

  it('DELETE /api/library/groups/{id} cascades to member series and reports counts', async () => {
    const res = await fetch('https://srv/api/library/groups/1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, number>).toEqual({
      deletedGroups: 1,
      deletedSeries: 2,
    });

    const groups = await getGroups();
    expect(groups.groups.find((g) => g.id === 1)).toBeUndefined();

    // The cascaded series (1 and 7) are gone from the library list.
    const series = await getSeries();
    expect(series.rows.find((s) => s.id === 1)).toBeUndefined();
    expect(series.rows.find((s) => s.id === 7)).toBeUndefined();
  });

  it('deleting the empty group needs no cascade (the plain-confirm path)', async () => {
    const res = await fetch('https://srv/api/library/groups/100', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, number>).toEqual({
      deletedGroups: 1,
      deletedSeries: 0,
    });
  });
});
