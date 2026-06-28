// Dependency-free in-app fetch interceptor for Maestro e2e runs.
//
// We can't use MSW v2 in React Native — it reaches for browser globals
// (MessageEvent, EventTarget, BroadcastChannel, …) that RN doesn't ship and
// even with polyfills the surface keeps expanding. The Jest test suite still
// uses MSW (Node has all those globals), so the data fixtures stay shared.
//
// This module monkey-patches `fetch` on first call, dispatching requests
// against the same fixtures `tests/mocks/handlers.ts` consumes. Env-flag
// overrides are honored.

import {
  fixtureSeries,
  fixtureDetail,
  fixtureSearchResults,
  fixtureReleases,
  fixtureDownloads,
  fixtureAuditEvents,
  fixtureUsers,
  fixtureAuthModes,
  fixtureContinueReading,
  fixtureComicsManifest,
  fixtureAudioManifest,
  fixtureMobiManifest,
  fixtureCalendarEntries,
  fixtureReplayRuns,
  fixtureReplayDiffs,
  fixtureUserProfile,
} from '@/../tests/mocks/fixtures';

const BASE = 'https://srv';

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

type Match = {
  method: string;
  path: RegExp;
  handle: (req: Request, m: RegExpMatchArray) => Promise<Response> | Response;
};

const routes: Match[] = [];

function on(method: string, path: RegExp, handle: Match['handle']): void {
  routes.push({ method, path, handle });
}

// --- Auth handshake (overridable) ---

on('GET', /^\/api\/mobile\/handshake$/, () => {
  if (process.env.EXPO_PUBLIC_MOBILE_E2E_SSL_FAIL === '1') {
    return Promise.reject(new Error('self-signed certificate detected'));
  }
  const modes = process.env.EXPO_PUBLIC_MOBILE_E2E_AUTH_MODE === 'oidc' ? ['oidc'] : ['password'];
  const pushEnabled = process.env.EXPO_PUBLIC_MOBILE_E2E_PUSH_ENABLED === '1';
  return json({
    server_version: '0.1.0',
    supported_auth_modes: modes,
    brand: 'bookkeeprr',
    push_enabled: pushEnabled,
  });
});

on('POST', /^\/api\/mobile\/push\/register$/, () =>
  json(
    {
      id: 'e2e-device-00000000-0000-0000-0000-000000000001',
      registered_at: new Date().toISOString(),
    },
    { status: 201 },
  ),
);

on('GET', /^\/api\/mobile\/version$/, () => {
  if (process.env.EXPO_PUBLIC_MOBILE_E2E_UPDATE_AVAILABLE === '1') {
    return json({ current: '0.2.0', min_supported: '0.1.0' });
  }
  return json({ current: '0.1.0', min_supported: '0.1.0' });
});

on('POST', /^\/api\/mobile\/exchange$/, () =>
  json({ token: 'tok-test', refresh_token: 'ref-test', expires_at: '2026-08-25T00:00:00Z' }),
);

on('POST', /^\/api\/mobile\/changelog-seen$/, async (req) => {
  const body = (await req
    .clone()
    .json()
    .catch(() => ({}))) as { version?: string };
  if (!body.version) return new Response(null, { status: 400 });
  return json({ ok: true });
});

// --- Library groups (stateful) ---
//
// The groups flows (tests/e2e/library/groups-*.yaml) create, move into,
// rename, and delete groups, and the library list must REFLECT those writes —
// so unlike the rest of the mock this section keeps in-memory state. Module
// scope is enough: every Maestro flow relaunches with `clearState: true`,
// resetting the JS world per flow (same pattern as deletedProgressKeys below).
//
// Initial fixture: one root group 'Shonen' (id 1) containing Chainsaw Man
// (series 7). New groups get DETERMINISTIC ids starting at 100 so flows can
// assert `group-row-100` after a create.

type MockGroup = { id: number; name: string; parentId: number | null };

const groupsState: MockGroup[] = [{ id: 1, name: 'Shonen', parentId: null }];
let nextGroupId = 100;
// seriesId → groupId override. Fixture rows all carry groupId null; this map
// is the single source of truth for membership (initial + PATCH moves).
const seriesGroupIds = new Map<number, number | null>([[7, 1]]);
// Series removed by a recursive group delete (library rows only).
const removedSeriesIds = new Set<number>();

function groupPathOf(id: number | null): string {
  const parts: string[] = [];
  let cursor: number | null = id;
  while (cursor !== null) {
    const g = groupsState.find((x) => x.id === cursor);
    if (!g) break;
    parts.unshift(g.name);
    cursor = g.parentId;
  }
  return parts.join(' / ');
}

/** `id` plus all recursive subgroup ids. */
function descendantGroupIds(id: number): Set<number> {
  const out = new Set<number>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of groupsState) {
      if (g.parentId !== null && out.has(g.parentId) && !out.has(g.id)) {
        out.add(g.id);
        grew = true;
      }
    }
  }
  return out;
}

/** The live series list: fixtures minus deleted rows, with group state applied. */
function liveSeries() {
  return fixtureSeries
    .filter((s) => !removedSeriesIds.has(s.id))
    .map((s) => {
      const groupId = seriesGroupIds.get(s.id) ?? null;
      return { ...s, groupId, groupPath: groupPathOf(groupId) };
    });
}

function siblingNameTaken(name: string, parentId: number | null, excludeId?: number): boolean {
  return groupsState.some(
    (g) =>
      g.id !== excludeId &&
      g.parentId === parentId &&
      g.name.toLowerCase() === name.toLowerCase(),
  );
}

/** Full LibraryGroup wire row (path + RECURSIVE seriesCount + direct subgroupCount). */
function groupWireRow(g: MockGroup) {
  const ids = descendantGroupIds(g.id);
  return {
    id: g.id,
    name: g.name,
    parentId: g.parentId,
    path: groupPathOf(g.id),
    seriesCount: liveSeries().filter((s) => s.groupId !== null && ids.has(s.groupId)).length,
    subgroupCount: groupsState.filter((x) => x.parentId === g.id).length,
  };
}

on('GET', /^\/api\/library\/groups$/, () => json({ groups: groupsState.map(groupWireRow) }));

on('POST', /^\/api\/library\/groups$/, async (req) => {
  const body = (await req
    .clone()
    .json()
    .catch(() => ({}))) as { name?: string; parentId?: number };
  const name = (body.name ?? '').trim();
  if (name.length === 0) return json({ error: 'Name is required' }, { status: 400 });
  const parentId = body.parentId ?? null;
  if (parentId !== null && !groupsState.some((g) => g.id === parentId)) {
    return json({ error: `Parent group ${parentId} does not exist` }, { status: 422 });
  }
  if (siblingNameTaken(name, parentId)) {
    return json({ error: `A group named "${name}" already exists here` }, { status: 409 });
  }
  const group: MockGroup = { id: nextGroupId++, name, parentId };
  groupsState.push(group);
  return json(groupWireRow(group), { status: 201 });
});

on('PATCH', /^\/api\/library\/groups\/(\d+)$/, async (req, m) => {
  const group = groupsState.find((g) => g.id === Number(m[1]));
  if (!group) return json({ error: 'not found' }, { status: 404 });
  const body = (await req
    .clone()
    .json()
    .catch(() => ({}))) as { name?: string };
  const name = (body.name ?? '').trim();
  if (name.length === 0) return json({ error: 'Name is required' }, { status: 400 });
  if (siblingNameTaken(name, group.parentId, group.id)) {
    return json({ error: `A group named "${name}" already exists here` }, { status: 409 });
  }
  group.name = name;
  return json(groupWireRow(group));
});

on('DELETE', /^\/api\/library\/groups\/(\d+)$/, (_req, m) => {
  const id = Number(m[1]);
  if (!groupsState.some((g) => g.id === id)) {
    return json({ error: 'not found' }, { status: 404 });
  }
  const ids = descendantGroupIds(id);
  const memberIds = liveSeries()
    .filter((s) => s.groupId !== null && ids.has(s.groupId))
    .map((s) => s.id);
  for (const sid of memberIds) removedSeriesIds.add(sid);
  for (const gid of ids) {
    const i = groupsState.findIndex((g) => g.id === gid);
    if (i !== -1) groupsState.splice(i, 1);
  }
  return json({ deletedGroups: ids.size, deletedSeries: memberIds.length });
});

// Move a series to a group (or back to the root with groupId null). The web
// route is a general series PATCH; the mock only honors the groupId field.
on('PATCH', /^\/api\/series\/(\d+)$/, async (req, m) => {
  const body = (await req
    .clone()
    .json()
    .catch(() => ({}))) as { groupId?: number | null };
  if ('groupId' in body) {
    const groupId = body.groupId ?? null;
    if (groupId !== null && !groupsState.some((g) => g.id === groupId)) {
      return json({ error: `Group ${groupId} does not exist` }, { status: 422 });
    }
    seriesGroupIds.set(Number(m[1]), groupId);
  }
  return json({ ok: true });
});

// --- Library ---

on('GET', /^\/api\/library\/summary$/, () => {
  const rows = liveSeries();
  const monitored = rows.filter((s) => s.monitored).length;
  const missing = rows.filter((s) => s.downloaded < s.volumes).length;
  return json({ total: rows.length, monitored, missing });
});

on('GET', /^\/api\/series(?:\?(.*))?$/, (req) => {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const start = (page - 1) * limit;
  const rows = liveSeries();
  return json({
    rows: rows.slice(start, start + limit),
    total: rows.length,
    page,
    limit,
  });
});

on('GET', /^\/api\/series\/(\d+)$/, (_req, m) => {
  const detail = fixtureDetail(Number(m[1]));
  if (!detail) return new Response('not found', { status: 404 });
  return json(detail);
});

on('POST', /^\/api\/series$/, async (req) => {
  const body = (await req
    .clone()
    .json()
    .catch(() => ({}))) as Record<string, unknown>;
  return json({ id: 999, ...body }, { status: 201 });
});

on('GET', /^\/api\/mobile\/search(?:\?(.*))?$/, (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.toLowerCase() ?? '';
  const contentType = url.searchParams.get('contentType') ?? 'manga';
  const matches = Object.entries(fixtureSearchResults)
    .filter(([key]) => key.includes(q) || q.includes(key))
    .flatMap(([, list]) => list)
    .filter((r) =>
      contentType === 'all' ? true : r.contentType === contentType || contentType === 'manga',
    );
  return json({
    query: q,
    contentType,
    tookMs: 412,
    results: matches.length > 0 ? matches : fixtureSearchResults.vinland,
  });
});

on('POST', /^\/api\/search\/interactive$/, async (req) => {
  const body = (await req
    .clone()
    .json()
    .catch(() => ({}))) as { seriesId?: number };
  return json({
    seriesId: body.seriesId ?? 1,
    tookMs: 412,
    indexerCount: 4,
    releases: fixtureReleases,
  });
});

on('POST', /^\/api\/releases\/(\d+)\/grab$/, (_req, m) =>
  json(
    { downloadId: Number(m[1]) + 100, qbtHash: 'abc123def456', status: 'queued' },
    { status: 201 },
  ),
);

// Manual magnet grab (paste-your-own-magnet on Interactive search).
on('POST', /^\/api\/series\/(\d+)\/manual-grab$/, () =>
  json({ releaseId: 999, downloadId: 999 }, { status: 201 }),
);

// --- Reader ---

// Readable keys whose progress was DELETEd in this app session. The
// continue-reading list filters these out so the rail's "remove" flow can
// observe the card disappearing after the delete + query invalidation.
// Module-level state is enough: every Maestro flow relaunches the app with
// `clearState: true`, which resets the JS world (and this Set) per flow.
const deletedProgressKeys = new Set<string>();

// The Continue-Reading list that backs the dashboard rail.
on('GET', /^\/api\/reader\/progress$/, () =>
  json({ items: fixtureContinueReading.filter((i) => !deletedProgressKeys.has(i.readableKey)) }),
);

// Manifest resolution: `volumeId` → the audiobook, `fileId=77` → the MOBI
// ebook (foliate text reader), any other `fileId` → the comic.
on('GET', /^\/api\/reader\/manifest(?:\?(.*))?$/, (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('volumeId')) return json(fixtureAudioManifest);
  if (url.searchParams.get('fileId') === '77') return json(fixtureMobiManifest);
  return json(fixtureComicsManifest);
});

// Whole-file ebook download (mobi/azw3) for the foliate WebView. The real bytes
// need a genuine .mobi on a device (Maestro, out of scope); here we return a
// tiny stub so the WebView document + chrome render. Accepts the scoped
// `?token=` exactly like the EPUB resource route.
on(
  'GET',
  /^\/api\/reader\/ebook\/\d+\/download(?:\?(.*))?$/,
  () =>
    new Response(new Uint8Array([0x00]), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    }),
);

// Persisting reading progress (the reader PUTs on every turn/scrub).
on('PUT', /^\/api\/reader\/progress\/.+$/, () => json({ ok: true }));

// Resetting reading progress (the rail's long-press → "Remove & reset").
// Records the key so subsequent GET /api/reader/progress responses drop it.
on('DELETE', /^\/api\/reader\/progress\/([^/]+)$/, (_req, m) => {
  deletedProgressKeys.add(decodeURIComponent(m[1] ?? ''));
  return json({});
});

// Comic page bytes — a 1x1 transparent PNG so the pager has something to draw.
const TRANSPARENT_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);
on(
  'GET',
  /^\/api\/reader\/comics\/\d+\/page\/\d+$/,
  () =>
    new Response(TRANSPARENT_PNG, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }),
);

// --- Calendar ---

// Release calendar. Mirrors the web route's [from, to) filtering so months
// without fixture entries (prev/next navigation) come back empty.
on('GET', /^\/api\/calendar(?:\?(.*))?$/, (req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const entries = fixtureCalendarEntries().filter((e) => e.date >= from && e.date < to);
  return json({ entries });
});

// --- System ---

// The AUTOAUTH session is an admin — admin-gated settings rows (Matcher,
// Audit, Users, …) need this to be visible in the settings list at all.
on('GET', /^\/api\/mobile\/me$/, () =>
  json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
);

// Matcher settings overview (weights + adult filter) so the admin view renders.
on('GET', /^\/api\/settings\/matcher$/, () =>
  json({
    weights: {
      groupTopWeight: 100,
      groupStepDown: 10,
      batchBonus: 50,
      seederMultiplier: 5,
      trustedBonus: 25,
      remakePenalty: -30,
      minSeeders: 1,
    },
    adultFilter: { enabled: false, blockedCategories: [] },
  }),
);

// Matcher replay history — list + run detail, sharing the Jest fixtures.
on('GET', /^\/api\/settings\/matcher\/replays(?:\?(.*))?$/, () =>
  json({ runs: fixtureReplayRuns }),
);

on('GET', /^\/api\/settings\/matcher\/replays\/(\d+)(?:\?(.*))?$/, (_req, m) => {
  const run = fixtureReplayRuns.find((r) => r.id === Number(m[1]));
  if (!run) return new Response('not found', { status: 404 });
  const rows = fixtureReplayDiffs.filter((d) => d.replayRunId === run.id);
  return json({ run, rows, total: rows.length });
});

on('GET', /^\/api\/downloads$/, () => json({ downloads: fixtureDownloads }));

// The mobile audit screen hits /api/mobile/audit/events (useAuditEvents); the
// optional `mobile/` segment keeps the legacy web-shaped path matching too.
on('GET', /^\/api\/(?:mobile\/)?audit\/events(?:\?(.*))?$/, (req) => {
  const url = new URL(req.url);
  const filter = url.searchParams.get('filter') ?? 'all';
  const rows =
    filter === 'all'
      ? fixtureAuditEvents
      : filter === 'writes'
        ? fixtureAuditEvents.filter((e) => e.verb !== 'login')
        : filter === 'logins'
          ? fixtureAuditEvents.filter((e) => e.verb === 'login')
          : fixtureAuditEvents.filter(
              (e) => e.diff.includes('rate-limited') || e.verb === 'delete',
            );
  return json({ rows, total: fixtureAuditEvents.length });
});

// The real route (and the UsersResponse schema) wrap the list as `{ users }`.
on('GET', /^\/api\/users$/, () => json({ users: fixtureUsers }));

// Member profile dossier (lifetime stats + shelves + activity).
on('GET', /^\/api\/profile\/(\d+)$/, (_req, m) => {
  const profile = fixtureUserProfile(Number(m[1]));
  if (!profile) return new Response('not found', { status: 404 });
  return json(profile);
});

// Log files list + tail pages (Logs screen auto-selects the newest file and
// immediately fetches its tail). Bodies mirror tests/mocks/handlers.ts.
on('GET', /^\/api\/audit\/logs\/files$/, () =>
  json({
    files: [
      { name: 'bookkeeprr.log', sizeBytes: 4096, mtime: 1717900000000 },
      { name: 'worker.log', sizeBytes: 2048, mtime: 1717800000000 },
    ],
  }),
);

on('GET', /^\/api\/audit\/logs\/files\/([^/?]+)(?:\?(.*))?$/, () =>
  json({
    lines: ['2026-06-09T00:00:00Z INFO server started', '2026-06-09T00:00:01Z INFO ready'],
    totalBytes: 4096,
    hasMore: false,
    nextBefore: 0,
  }),
);

// Cloud connection overview (disconnected default, mirrors handlers.ts).
on('GET', /^\/api\/settings\/cloud$/, () =>
  json({
    config: {
      enabled: false,
      cloudBaseUrl: 'https://cloud.bookkeeprr.app',
      tenantId: null,
      installUuid: '00000000-0000-0000-0000-000000000000',
      acceptedEulaVersion: null,
      acceptedPrivacyVersion: null,
      acceptedAt: null,
      lastRegisterError: null,
    },
  }),
);

on('GET', /^\/api\/settings\/notifications$/, () =>
  json({
    discordWebhookUrl: '••••••••',
    discordWebhookConfigured: true,
    discordUsername: 'bookkeeprr',
    discordAvatarUrl: null,
    appriseUrl: '••••••••',
    appriseConfigured: true,
    eventGrabSuccess: true,
    eventImportSuccess: true,
    eventFailure: true,
    eventUpdateAvailable: true,
  }),
);

on('GET', /^\/api\/auth\/config$/, () => json({ modes: fixtureAuthModes }));

// --- Sources settings ---
// Single-secret metadata providers (ComicVine / Google Books / MAL / NYT):
// each GET returns its `{ apiKey }` / `{ clientId }` object directly, masked
// to '****' when set and '' when unset. Bodies mirror tests/mocks/handlers.ts.

on('GET', /^\/api\/settings\/comicvine$/, () => json({ apiKey: '****' }));
on('GET', /^\/api\/settings\/googlebooks$/, () => json({ apiKey: '' }));
on('GET', /^\/api\/settings\/mal$/, () => json({ clientId: '****' }));
on('GET', /^\/api\/settings\/nyt$/, () => json({ apiKey: '****' }));

on('GET', /^\/api\/settings\/search-providers$/, () =>
  json({
    anilist: true,
    mal: true,
    mangadex: true,
    comicvine: true,
    openlibrary: true,
    audnex: true,
    novelupdates: true,
  }),
);

on('GET', /^\/api\/settings\/qbt$/, () =>
  json({ host: '', port: 8080, username: '', password: '', useHttps: false }),
);

on('GET', /^\/api\/settings\/flaresolverr$/, () => json({ url: '' }));

on('GET', /^\/api\/indexers$/, () => json({ indexers: [] }));
on('GET', /^\/api\/settings\/prowlarr$/, () => json({ url: '', apiKey: '' }));

// --- Discover ---

on('GET', /^\/api\/discover\/sources$/, () =>
  json({
    sources: [
      { id: 'anilist', label: 'AniList', configured: true },
      { id: 'mangadex', label: 'MangaDex', configured: true },
      { id: 'comicvine', label: 'ComicVine', configured: true },
      { id: 'openlibrary', label: 'OpenLibrary', configured: true },
      { id: 'audnex', label: 'Audnex', configured: true },
    ],
  }),
);

on('GET', /^\/api\/discover\/browse$/, () =>
  json({
    rows: [
      {
        id: 'trending',
        label: 'Trending now',
        meta: '5 sources',
        items: [
          { contentType: 'manga', sourceId: 'anilist:1', title: 'Chainsaw Man', year: 2018, author: 'Tatsuki Fujimoto', isbn: null, coverUrl: null, source: 'anilist', detail: null, inLib: false },
        ],
      },
    ],
  }),
);

on('GET', /^\/api\/discover\/search(?:\?(.*))?$/, (req) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').toLowerCase();
  const results = q.includes('classroom')
    ? Array.from({ length: 7 }, (_, i) => ({
        contentType: 'light_novel' as const,
        sourceId: `anilist:classroom-${i + 1}`,
        title: `Classroom of the Elite, Vol. ${i + 1}`,
        year: 2015 + i,
        author: 'Shōgo Kinugasa',
        isbn: null,
        coverUrl: null,
        source: 'anilist',
        detail: 'Year 1',
        inLib: false,
      }))
    : [];
  return json({ results, tookMs: 412 });
});

let installed = false;

export function installFetchMock(): void {
  if (installed) return;
  installed = true;
  const realFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input.toString(), init);
    const url = new URL(req.url);
    // The SSL-warning flow inputs `https://self-signed.example`; when SSL_FAIL=1
    // is baked, reject every handshake so the ServerUrl screen surfaces the
    // self-signed certificate branch regardless of the host.
    if (
      process.env.EXPO_PUBLIC_MOBILE_E2E_SSL_FAIL === '1' &&
      url.pathname === '/api/mobile/handshake'
    ) {
      return Promise.reject(new Error('self-signed certificate detected'));
    }
    if (!req.url.startsWith(BASE)) return realFetch(input as RequestInfo, init);

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const fullPath = url.pathname + (url.search || '');
      const matchTarget = route.path.source.includes('\\?') ? fullPath : url.pathname;
      const m = matchTarget.match(route.path);
      if (m) return route.handle(req, m);
    }
    return new Response('mock unmatched: ' + req.method + ' ' + url.pathname, { status: 404 });
  };
}
