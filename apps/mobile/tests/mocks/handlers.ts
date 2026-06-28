import { http, HttpResponse } from 'msw';
import {
  fixtureSeries,
  fixtureDetail,
  fixtureSearchResults,
  fixtureReleases,
  fixtureDownloads,
  fixtureAuditEvents,
  fixtureUsers,
  fixtureAuthModes,
  fixtureCalendarEntries,
  fixtureReplayRuns,
  fixtureReplayDiffs,
  fixtureUserProfile,
} from './fixtures';

const BASE = 'https://srv';

export const handlers = [
  http.get(`${BASE}/api/mobile/handshake`, () =>
    HttpResponse.json({
      server_version: '0.1.0',
      supported_auth_modes: ['password', 'oidc'],
      brand: 'bookkeeprr',
    }),
  ),
  http.get(`${BASE}/api/mobile/version`, () =>
    HttpResponse.json({ current: '0.1.0', min_supported: '0.1.0' }),
  ),
  http.post(`${BASE}/api/mobile/exchange`, async () =>
    HttpResponse.json({
      token: 'tok-test',
      refresh_token: 'ref-test',
      expires_at: '2026-08-25T00:00:00Z',
    }),
  ),
  // Default: no groups. Group-browse suites override with server.use().
  http.get(`${BASE}/api/library/groups`, () => HttpResponse.json({ groups: [] })),
  http.get(`${BASE}/api/library/summary`, () => {
    const monitored = fixtureSeries.filter((s) => s.monitored).length;
    const missing = fixtureSeries.filter((s) => s.downloaded < s.volumes).length;
    return HttpResponse.json({ total: fixtureSeries.length, monitored, missing });
  }),
  http.get(`${BASE}/api/series`, ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    // Mirror the real server's title `q` filter so search-driven UI (incl. the
    // empty-result path) behaves the same against the mock.
    const q = url.searchParams.get('q')?.toLowerCase().trim() ?? '';
    const matched = q
      ? fixtureSeries.filter((s) => s.title.toLowerCase().includes(q))
      : fixtureSeries;
    const start = (page - 1) * limit;
    return HttpResponse.json({
      rows: matched.slice(start, start + limit),
      total: matched.length,
      page,
      limit,
    });
  }),
  http.get(`${BASE}/api/series/:id`, ({ params }) => {
    const detail = fixtureDetail(Number(params.id));
    if (!detail) return new HttpResponse('not found', { status: 404 });
    return HttpResponse.json(detail);
  }),
  // Book-series list. LibraryHome and SeriesOverview call useBookSeriesMemberMap
  // on mount, which hits this endpoint. Without a handler the request fails the
  // network class, flips `serverReachable` false, and online-flow assertions get
  // gated off (gate() toasts "Unavailable offline" instead of opening sheets).
  // Default to an empty list; suites that exercise book-series features override
  // with server.use().
  http.get(`${BASE}/api/book-series`, () => HttpResponse.json({ bookSeries: [] })),
  // Continue-Reading list. SeriesOverview (and other screens) fire this via
  // useContinueReading on mount; default it to an empty list so the request
  // succeeds and the connectivity passive-signal stays reachable. Without a
  // handler the request fails the network class, flips `serverReachable` false,
  // and online-flow assertions get gated off. Suites needing specific progress
  // (e.g. series-cta-labels) override with server.use().
  http.get(`${BASE}/api/reader/progress`, () => HttpResponse.json({ items: [] })),
  http.get(`${BASE}/api/mobile/search`, ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const contentType = url.searchParams.get('contentType') ?? 'manga';
    const matches = Object.entries(fixtureSearchResults)
      .filter(([key]) => key.includes(q) || q.includes(key))
      .flatMap(([, list]) => list)
      .filter((r) =>
        contentType === 'all' ? true : r.contentType === contentType || contentType === 'manga',
      );
    return HttpResponse.json({
      query: q,
      contentType,
      tookMs: 412,
      results: matches.length > 0 ? matches : fixtureSearchResults.vinland,
    });
  }),
  http.post(`${BASE}/api/series`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 999, ...body }, { status: 201 });
  }),
  http.post(`${BASE}/api/search/interactive`, async ({ request }) => {
    const body = (await request.json()) as { seriesId: number };
    return HttpResponse.json({
      seriesId: body.seriesId,
      tookMs: 412,
      indexerCount: 4,
      releases: fixtureReleases,
    });
  }),
  http.post(`${BASE}/api/releases/:id/grab`, ({ params }) => {
    return HttpResponse.json(
      {
        downloadId: Number(params.id) + 100,
        qbtHash: 'abc123def456',
        status: 'queued',
      },
      { status: 201 },
    );
  }),
  // Manual magnet grab: 201 with the created release + download ids.
  http.post(`${BASE}/api/series/:id/manual-grab`, () =>
    HttpResponse.json({ releaseId: 999, downloadId: 999 }, { status: 201 }),
  ),
  http.get(`${BASE}/api/downloads`, () => HttpResponse.json({ downloads: fixtureDownloads })),
  // Release calendar. Mirrors the web route's [from, to) filtering so months
  // without fixture entries (prev/next navigation) come back empty.
  http.get(`${BASE}/api/calendar`, ({ request }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const entries = fixtureCalendarEntries().filter((e) => e.date >= from && e.date < to);
    return HttpResponse.json({ entries });
  }),
  http.get(`${BASE}/api/mobile/audit/events`, ({ request }) => {
    const url = new URL(request.url);
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
    return HttpResponse.json({ rows, total: fixtureAuditEvents.length });
  }),
  http.get(`${BASE}/api/users`, () => HttpResponse.json({ users: fixtureUsers })),
  // Member profile dossier (lifetime stats + shelves + activity).
  http.get(`${BASE}/api/profile/:userId`, ({ params }) => {
    const profile = fixtureUserProfile(Number(params.userId));
    if (!profile) return new HttpResponse('not found', { status: 404 });
    return HttpResponse.json(profile);
  }),
  // Default happy-path Access-settings handlers so any suite that mounts a
  // settings screen (e.g. the tablet split-pane rendering the Auth / API panes)
  // doesn't hit an unhandled request. Suites that exercise these endpoints
  // override them per-test via `server.use(...)`.
  http.get(`${BASE}/api/auth/oidc/config`, () =>
    HttpResponse.json({
      config: {
        enabled: false,
        issuer: '',
        clientId: '',
        clientSecret: '',
        scopes: [],
        buttonLabel: '',
        usernameClaim: '',
        emailClaim: '',
        groupsClaim: '',
        allowedGroups: [],
        adminGroups: [],
        autoCreateUsers: false,
      },
    }),
  ),
  http.get(`${BASE}/api/auth/forward-auth/config`, () =>
    HttpResponse.json({
      config: {
        enabled: false,
        trustedProxies: [],
        userHeader: 'Remote-User',
        emailHeader: 'Remote-Email',
        groupsHeader: 'Remote-Groups',
        autoCreateUsers: false,
        allowedGroups: [],
        adminGroups: [],
      },
    }),
  ),
  http.get(`${BASE}/api/settings/api-key`, () =>
    HttpResponse.json({ enabled: false, key: '', createdAt: null }),
  ),
  http.get(`${BASE}/api/settings/notifications`, () =>
    HttpResponse.json({
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
  ),
  http.get(`${BASE}/api/mobile/auth/config`, () => HttpResponse.json({ modes: fixtureAuthModes })),
  // Several screens (Account, MobAccount, TopBar) call /api/auth/me on mount.
  // Without a handler, MSW logs an unhandled-request warning, which the test
  // setup forwards to console.warn (tests/setup.ts:341) — adds noise in CI.
  http.get(`${BASE}/api/auth/me`, () =>
    HttpResponse.json({
      user: {
        id: 1,
        username: 'admin',
        role: 'admin',
        mustChangePassword: false,
        email: 'admin@example.com',
        avatarUrl: null,
        totpEnabledAt: null,
      },
    }),
  ),
  // Default /api/mobile/me returns an admin so tests that mount admin-gated
  // screens (e.g. Users) render the admin subtree without an explicit per-test
  // override. Tests that need a non-admin perspective override via server.use().
  http.get(`${BASE}/api/mobile/me`, () =>
    HttpResponse.json({
      id: 1,
      username: 'admin',
      email: null,
      displayName: null,
      role: 'admin',
    }),
  ),
  // Default happy-path System-settings handlers (Logs + Cloud) so any suite
  // mounting these screens (or the tablet split-pane that renders them) renders
  // without an unhandled-request warning. Suites that exercise these endpoints
  // override them per-test via `server.use(...)`.
  http.get(`${BASE}/api/audit/logs/files`, () =>
    HttpResponse.json({
      files: [
        { name: 'bookkeeprr.log', sizeBytes: 4096, mtime: 1717900000000 },
        { name: 'worker.log', sizeBytes: 2048, mtime: 1717800000000 },
      ],
    }),
  ),
  http.get(`${BASE}/api/audit/logs/files/:name`, () =>
    HttpResponse.json({
      lines: ['2026-06-09T00:00:00Z INFO server started', '2026-06-09T00:00:01Z INFO ready'],
      totalBytes: 4096,
      hasMore: false,
      nextBefore: 0,
    }),
  ),
  http.get(`${BASE}/api/settings/cloud`, () =>
    HttpResponse.json({
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
  ),
  http.get(`${BASE}/api/settings/cloud/terms`, () =>
    HttpResponse.json({
      terms: {
        eulaVersion: '1',
        eulaUrl: 'https://cloud.bookkeeprr.app/eula',
        privacyVersion: '1',
        privacyUrl: 'https://cloud.bookkeeprr.app/privacy',
        effectiveAt: '2026-01-01T00:00:00Z',
      },
    }),
  ),
  http.get(`${BASE}/api/mobile/changelog-seen`, () =>
    HttpResponse.json({ version: null }),
  ),
  http.post(`${BASE}/api/mobile/changelog-seen`, async ({ request }) => {
    const body = (await request.json()) as { version?: string };
    if (!body.version) return new HttpResponse(null, { status: 400 });
    return HttpResponse.json({ version: body.version });
  }),
  // Default happy-path General-settings handlers (Updates / Auto-grab / Matcher /
  // Housekeeping / Naming) so any suite that mounts a General screen (or the
  // tablet split-pane rendering one) renders without an unhandled-request
  // warning. Suites that exercise these endpoints override them per-test via
  // `server.use(...)`.
  http.get(`${BASE}/api/updates`, () =>
    HttpResponse.json({
      buildInfo: {
        version: '0.1.0',
        commit: 'abcdef0',
        builtAt: '2026-06-09T00:00:00Z',
        channel: 'stable',
        runtime: 'docker',
        uptime: 1234,
      },
      state: {
        latestVersion: '0.1.0',
        latestReleaseUrl: null,
        latestReleaseBody: null,
        latestPublishedAt: null,
        fetchedAt: '2026-06-09T00:00:00Z',
        fetchError: null,
      },
      config: {
        frequency: 'daily',
        behavior: 'notify',
        notifyOnIntegrations: false,
        showChangelogOnFirstLaunch: true,
      },
      deploymentMode: 'auto',
      updateAvailable: false,
      lastSeenVersion: '0.1.0',
    }),
  ),
  http.get(`${BASE}/api/settings/auto-grab`, () => HttpResponse.json({ dryRun: false })),
  http.get(`${BASE}/api/settings/matcher`, () =>
    HttpResponse.json({
      weights: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 5,
        seederMultiplier: 1,
        trustedBonus: 20,
        remakePenalty: 15,
      },
      adultFilter: { enabled: false, blockedCategories: [] },
    }),
  ),
  http.get(`${BASE}/api/settings/housekeeping`, () =>
    HttpResponse.json({
      jobs: { terminalDays: 7, errorDays: 30 },
      backups: { daily: 7, monthlyDay1: 6 },
      visibility: { auditRetentionDays: 90, logRetentionDays: 14 },
      releases: { keepPerSeries: 50, olderThanDays: 30 },
    }),
  ),
  // Default happy-path Sources-settings handlers (ComicVine / Google Books /
  // MAL / NYT / Search Providers) so suites that mount Sources screens (or the
  // tablet split-pane rendering them) render without unhandled-request warnings.
  // Suites that exercise these endpoints override them per-test via server.use().
  http.get(`${BASE}/api/settings/comicvine`, () =>
    HttpResponse.json({ apiKey: '****' }),
  ),
  http.get(`${BASE}/api/settings/googlebooks`, () =>
    HttpResponse.json({ apiKey: '' }),
  ),
  http.get(`${BASE}/api/settings/mal`, () =>
    HttpResponse.json({ clientId: '****' }),
  ),
  http.get(`${BASE}/api/settings/nyt`, () =>
    HttpResponse.json({ apiKey: '****' }),
  ),
  http.get(`${BASE}/api/settings/search-providers`, () =>
    HttpResponse.json({
      anilist: true,
      mal: true,
      mangadex: true,
      comicvine: true,
      openlibrary: true,
      audnex: true,
      novelupdates: true,
    }),
  ),
  // Default happy-path Download-client + FlareSolverr handlers so any suite
  // that mounts a Sources screen renders without unhandled-request warnings.
  // Suites that exercise these endpoints override them per-test via server.use().
  http.get(`${BASE}/api/settings/qbt`, () =>
    HttpResponse.json({ host: '', port: 8080, username: '', password: '', useHttps: false }),
  ),
  http.get(`${BASE}/api/settings/flaresolverr`, () =>
    HttpResponse.json({ url: '' }),
  ),
  // Default Indexers + Prowlarr config handlers so any suite that mounts the
  // Indexers screen renders without unhandled-request warnings. Suites that
  // exercise these endpoints override them per-test via server.use().
  http.get(`${BASE}/api/indexers`, () =>
    HttpResponse.json({ indexers: [] }),
  ),
  http.get(`${BASE}/api/settings/prowlarr`, () =>
    HttpResponse.json({ url: '', apiKey: '' }),
  ),
  // Default happy-path Library-settings handlers (Storage + Discover) so any
  // suite that mounts a Library screen renders without unhandled-request warnings.
  // Suites that exercise these endpoints override them per-test via server.use().
  http.get(`${BASE}/api/settings/storage`, () =>
    HttpResponse.json({
      contentTypePaths: {
        manga: { libraryRoot: '', qbtCategory: '' },
        comic: { libraryRoot: '', qbtCategory: '' },
        light_novel: { libraryRoot: '', qbtCategory: '' },
        ebook: { libraryRoot: '', qbtCategory: '' },
        audiobook: { libraryRoot: '', qbtCategory: '' },
      },
      torrentCleanup: { mode: 'never', deleteFiles: false },
      imageCache: { enabled: false, dir: '' },
    }),
  ),
  http.get(`${BASE}/api/settings/discover`, () =>
    HttpResponse.json({ trendingSource: 'anilist' }),
  ),
  // Default happy-path Library Sync handlers (Audiobookshelf + Calibre) so any
  // suite that mounts the LibrarySync screen renders without unhandled-request
  // warnings. Suites that exercise these endpoints override them per-test via
  // server.use().
  http.get(`${BASE}/api/settings/library-sync/audiobookshelf`, () =>
    HttpResponse.json({
      baseUrl: null,
      apiToken: null,
      libraryId: null,
      contentTypes: [],
      enabled: false,
      configured: false,
    }),
  ),
  http.get(`${BASE}/api/settings/library-sync/calibre`, () =>
    HttpResponse.json({
      baseUrl: null,
      username: null,
      password: '',
      libraryId: '0',
      contentTypes: [],
      enabled: false,
      configured: false,
    }),
  ),
  // Matcher replay history — list + run detail (run + hydrated diff rows).
  http.get(`${BASE}/api/settings/matcher/replays`, () =>
    HttpResponse.json({ runs: fixtureReplayRuns }),
  ),
  http.get(`${BASE}/api/settings/matcher/replays/:runId`, ({ params }) => {
    const run = fixtureReplayRuns.find((r) => r.id === Number(params.runId));
    if (!run) return new HttpResponse('not found', { status: 404 });
    const rows = fixtureReplayDiffs.filter((d) => d.replayRunId === run.id);
    return HttpResponse.json({ run, rows, total: rows.length });
  }),
  // Returns manga defaults regardless of the ?contentType= query param; suites
  // exercising other content types override per-test.
  http.get(`${BASE}/api/settings/naming`, ({ request }) => {
    const url = new URL(request.url);
    const contentType = url.searchParams.get('contentType') ?? 'manga';
    return HttpResponse.json({
      contentType,
      templates: {
        series_folder: '{series_title}',
        volume: '{series_title} - v{volume:00} [{group}].{ext}',
        chapter: '{series_title} - c{chapter:000} [{group}].{ext}',
        batch: '{series_title} - c{chapter_range} [{group}].{ext}',
        volume_subfolder: '',
      },
    });
  }),
  // Default happy-path quality-profiles handler. Discover sheets use this to
  // pick the default profile instead of hardcoding id 1. Suites that need
  // specific profiles override per-test via server.use().
  http.get(`${BASE}/api/quality-profiles`, () =>
    HttpResponse.json([
      { id: 1, name: 'Default', isDefault: true },
    ]),
  ),
];
