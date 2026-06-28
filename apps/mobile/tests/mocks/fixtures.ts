import type {
  SeriesSummary,
  SeriesDetail,
  SearchResult,
  Download,
  AuditEvent,
  UserRow,
  AuthModeSummary,
  ContinueReadingItem,
  ReaderManifest,
  ReplayRun,
  ReplayDiffRow,
} from '@/api/schemas';

export const fixtureSeries: SeriesSummary[] = [
  {
    id: 1,
    title: 'Vinland Saga',
    contentType: 'manga',
    coverUrl: null,
    monitored: true,
    volumes: 25,
    downloaded: 22,
    readState: 'reading',
    health: 'missing',
    groupId: null,
    groupPath: '',
  },
  {
    id: 2,
    title: 'Berserk',
    contentType: 'manga',
    coverUrl: null,
    monitored: true,
    volumes: 41,
    downloaded: 41,
    readState: 'finished',
    health: 'complete',
    groupId: null,
    groupPath: '',
  },
  {
    id: 3,
    title: 'Spice and Wolf',
    contentType: 'novel',
    coverUrl: null,
    monitored: true,
    volumes: 23,
    downloaded: 18,
    groupId: null,
    groupPath: '',
  },
  {
    id: 4,
    title: 'Saga',
    contentType: 'comic',
    coverUrl: null,
    monitored: true,
    volumes: 11,
    downloaded: 11,
    groupId: null,
    groupPath: '',
  },
  {
    id: 5,
    title: 'The Expanse',
    contentType: 'ebook',
    coverUrl: null,
    monitored: false,
    volumes: 9,
    downloaded: 9,
    readState: 'finished',
    health: 'complete',
    groupId: null,
    groupPath: '',
  },
  {
    id: 6,
    title: 'Project Hail Mary',
    contentType: 'audio',
    coverUrl: null,
    monitored: true,
    volumes: 1,
    downloaded: 1,
    groupId: null,
    groupPath: '',
  },
  {
    id: 7,
    title: 'Chainsaw Man',
    contentType: 'manga',
    coverUrl: null,
    monitored: true,
    volumes: 17,
    downloaded: 12,
    groupId: null,
    groupPath: '',
  },
  {
    id: 8,
    title: 'Re:Zero',
    contentType: 'novel',
    coverUrl: null,
    monitored: true,
    volumes: 38,
    downloaded: 30,
    groupId: null,
    groupPath: '',
  },
  {
    id: 9,
    title: 'Invincible',
    contentType: 'comic',
    coverUrl: null,
    monitored: true,
    volumes: 25,
    downloaded: 25,
    groupId: null,
    groupPath: '',
  },
  {
    id: 10,
    title: 'Mistborn',
    contentType: 'ebook',
    coverUrl: null,
    monitored: true,
    volumes: 7,
    downloaded: 7,
    groupId: null,
    groupPath: '',
  },
  {
    id: 11,
    title: 'Dune',
    contentType: 'audio',
    coverUrl: null,
    monitored: true,
    volumes: 6,
    downloaded: 6,
    groupId: null,
    groupPath: '',
  },
  {
    id: 12,
    title: 'One Piece',
    contentType: 'manga',
    coverUrl: null,
    monitored: true,
    volumes: 108,
    downloaded: 100,
    groupId: null,
    groupPath: '',
  },
];

export const fixtureSearchResults: Record<string, SearchResult[]> = {
  vinland: [
    {
      sourceId: 'anilist:30002',
      contentType: 'manga',
      title: 'Vinland Saga',
      author: 'Makoto Yukimura',
      year: 2005,
      coverUrl: null,
      summary: 'A young Viking seeks revenge.',
      inLibrary: true,
    },
    {
      sourceId: 'anilist:30003',
      contentType: 'novel',
      title: 'Vinland Saga · Light Novel',
      author: 'Shigeru Nishiyama',
      year: 2008,
      coverUrl: null,
      summary: 'Side stories.',
      inLibrary: false,
    },
    {
      sourceId: 'audnex:b074',
      contentType: 'audio',
      title: 'Vinland Saga · Audio Drama',
      author: 'Audible Original',
      year: 2022,
      coverUrl: null,
      summary: 'Audio adaptation.',
      inLibrary: false,
    },
    {
      sourceId: 'olib:ww789',
      contentType: 'ebook',
      title: 'Vinland: The Definitive Edn',
      author: 'OpenLibrary 2019',
      year: 2019,
      coverUrl: null,
      summary: null,
      inLibrary: false,
    },
  ],
  berserk: [
    {
      sourceId: 'anilist:30007',
      contentType: 'manga',
      title: 'Berserk',
      author: 'Kentaro Miura',
      year: 1990,
      coverUrl: null,
      summary: 'Guts vs the world.',
      inLibrary: true,
    },
  ],
};

export const fixtureReleases = [
  {
    releaseId: 9,
    indexer: 'NYAA',
    title: 'Vinland.Saga.v28.[Stevenmagnet].cbz',
    sizeBytes: 333_447_168,
    seeders: 12,
    leechers: 3,
    publishedAt: '2026-05-25T20:00:00Z',
    quality: 'CBZ · HQ',
    recommended: true,
    accepted: true,
    rejectionReason: null,
    grabUrl: null,
  },
  {
    releaseId: 10,
    indexer: 'ANIMEBYTES',
    title: 'Vinland.Saga.v28.[Kodansha].cbz',
    sizeBytes: 432_013_312,
    seeders: 5,
    leechers: 1,
    publishedAt: '2026-05-25T18:00:00Z',
    quality: 'CBZ · HQ',
    recommended: false,
    accepted: true,
    rejectionReason: null,
    grabUrl: null,
  },
  {
    releaseId: 11,
    indexer: 'MDEX',
    title: 'Vinland Saga 28 (digital).pdf',
    sizeBytes: 207_618_048,
    seeders: 0,
    leechers: 0,
    publishedAt: '2026-05-25T08:00:00Z',
    quality: 'PDF',
    recommended: false,
    accepted: true,
    rejectionReason: null,
    grabUrl: null,
  },
  {
    releaseId: 12,
    indexer: 'NYAA',
    title: 'Vinland.Saga.v28.RAW.JP.cbr',
    sizeBytes: 652_281_344,
    seeders: 2,
    leechers: 0,
    publishedAt: '2026-05-23T08:00:00Z',
    quality: 'LANG',
    recommended: false,
    accepted: false,
    rejectionReason: 'language not in quality profile',
    grabUrl: null,
  },
  {
    releaseId: 13,
    indexer: 'ANIMEBYTES',
    title: 'Vinland_Saga_28_color_v2.cbz',
    sizeBytes: 612_368_384,
    seeders: 8,
    leechers: 2,
    publishedAt: '2026-05-24T20:00:00Z',
    quality: 'CBZ · HQ',
    recommended: false,
    accepted: true,
    rejectionReason: null,
    grabUrl: null,
  },
];

export const fixtureDownloads: Download[] = [
  {
    id: 1,
    qbtHash: 'a1',
    status: 'downloading',
    addedAt: '2026-05-26T08:30:00Z',
    completedAt: null,
    importedAt: null,
    error: null,
    release: { id: 9, title: 'Vinland.Saga.v28.cbz', indexerGuid: 'g-9' },
    series: { id: 1, title: 'Vinland Saga' },
  },
  {
    id: 2,
    qbtHash: 'b2',
    status: 'downloading',
    addedAt: '2026-05-26T08:32:00Z',
    completedAt: null,
    importedAt: null,
    error: null,
    release: { id: 14, title: 'Saga.067.cbr', indexerGuid: 'g-14' },
    series: { id: 4, title: 'Saga' },
  },
  {
    id: 3,
    qbtHash: 'c3',
    status: 'queued',
    addedAt: '2026-05-26T08:33:00Z',
    completedAt: null,
    importedAt: null,
    error: null,
    release: { id: 18, title: 'Re.Zero.v35.epub', indexerGuid: 'g-18' },
    series: { id: 8, title: 'Re:Zero' },
  },
  {
    id: 4,
    qbtHash: 'd4',
    status: 'queued',
    addedAt: '2026-05-26T08:34:00Z',
    completedAt: null,
    importedAt: null,
    error: null,
    release: { id: 22, title: 'Chainsaw.Man.v16.cbz', indexerGuid: 'g-22' },
    series: { id: 7, title: 'Chainsaw Man' },
  },
  {
    id: 5,
    qbtHash: 'e5',
    status: 'imported',
    addedAt: '2026-05-26T07:00:00Z',
    completedAt: '2026-05-26T07:50:00Z',
    importedAt: '2026-05-26T07:52:00Z',
    error: null,
    release: { id: 7, title: 'Vinland.Saga.v27.cbz', indexerGuid: 'g-7' },
    series: { id: 1, title: 'Vinland Saga' },
  },
  {
    id: 6,
    qbtHash: 'f6',
    status: 'failed',
    addedAt: '2026-05-26T06:00:00Z',
    completedAt: null,
    importedAt: null,
    error: 'NYAA · CONNECTION RESET',
    release: { id: 13, title: 'Berserk.v42.cbz', indexerGuid: 'g-13' },
    series: { id: 2, title: 'Berserk' },
  },
  {
    id: 7,
    qbtHash: 'g7',
    status: 'imported',
    addedAt: '2026-05-26T04:00:00Z',
    completedAt: '2026-05-26T04:10:00Z',
    importedAt: '2026-05-26T04:11:00Z',
    error: null,
    release: { id: 25, title: 'project-hail-mary.epub', indexerGuid: 'g-25' },
    series: { id: 6, title: 'Project Hail Mary' },
  },
  // A redundant sibling the server cancelled after a better release imported
  // (terminal). Surfaces in the Activity history ("Done") tab — the Maestro
  // flow tests/e2e/system/activity-superseded.yaml asserts this row.
  {
    id: 8,
    qbtHash: 'h8',
    status: 'superseded',
    addedAt: '2026-05-26T05:00:00Z',
    completedAt: '2026-05-26T05:40:00Z',
    importedAt: null,
    error: null,
    release: { id: 26, title: 'Vinland.Saga.v27.[dup].cbz', indexerGuid: 'g-26' },
    series: { id: 1, title: 'Vinland Saga' },
  },
];

export const fixtureAuditEvents: AuditEvent[] = [
  {
    id: 1,
    occurredAt: '2026-05-26T17:42:00Z',
    actor: { userId: 2, username: 'sofia', role: 'user' },
    verb: 'create',
    action: 'added series',
    target: 'series:vinland-saga',
    diff: '+ monitored',
  },
  {
    id: 2,
    occurredAt: '2026-05-26T17:36:00Z',
    actor: { userId: 1, username: 'paul', role: 'admin' },
    verb: 'update',
    action: 'edited quality profile',
    target: 'profile:manga-cbz-hq',
    diff: 'cbz-sd → cbz-hq',
  },
  {
    id: 3,
    occurredAt: '2026-05-26T17:22:00Z',
    actor: { userId: 3, username: 'toni', role: 'user' },
    verb: 'login',
    action: 'signed in via OIDC',
    target: 'session:tn-1f4a',
    diff: 'ip 10.0.0.42',
  },
  {
    id: 4,
    occurredAt: '2026-05-26T16:58:00Z',
    actor: { userId: 1, username: 'paul', role: 'admin' },
    verb: 'delete',
    action: 'removed indexer',
    target: 'indexer:nyaa-legacy',
    diff: '- enabled',
  },
  {
    id: 5,
    occurredAt: '2026-05-26T14:11:00Z',
    actor: { userId: 1, username: 'paul', role: 'admin' },
    verb: 'update',
    action: 'added apprise URL',
    target: 'integration:apprise',
    diff: '+ gotify://…',
  },
  {
    id: 6,
    occurredAt: '2026-05-26T09:02:00Z',
    actor: { userId: 1, username: 'paul', role: 'admin' },
    verb: 'create',
    action: 'invited user',
    target: 'user:lina',
    diff: 'role: user',
  },
  {
    id: 7,
    occurredAt: '2026-05-25T22:15:00Z',
    actor: null,
    verb: 'login',
    action: 'failed sign-in',
    target: 'user:admin · 203.0.113.4',
    diff: 'rate-limited',
  },
];

export const fixtureUsers: UserRow[] = [
  {
    id: 1,
    username: 'paul',
    email: 'paul@bookkeeprr.local',
    role: 'admin',
    source: 'local',
    disabled: false,
    createdAt: '2026-01-10T00:00:00Z',
    lastLoginAt: '2026-05-26T08:00:00Z',
  },
  {
    id: 2,
    username: 'sofia',
    email: 'sofia@example.com',
    role: 'user',
    source: 'local',
    disabled: false,
    createdAt: '2026-02-12T00:00:00Z',
    lastLoginAt: '2026-05-26T07:20:00Z',
  },
  {
    id: 3,
    username: 'toni',
    email: 'toni@example.com',
    role: 'user',
    source: 'oidc',
    disabled: false,
    createdAt: '2026-03-01T00:00:00Z',
    lastLoginAt: '2026-05-26T17:22:00Z',
  },
  {
    id: 4,
    username: 'lina',
    email: 'lina@example.org',
    role: 'user',
    source: 'local',
    disabled: true,
    createdAt: '2026-04-05T00:00:00Z',
    lastLoginAt: null,
  },
];


export const fixtureAuthModes: AuthModeSummary[] = [
  { kind: 'local', enabled: true, summary: 'Username + password' },
  { kind: 'oidc', enabled: true, summary: 'Authentik · authentik.example.com' },
  { kind: 'forward_auth', enabled: false, summary: 'Forward-auth header (off)' },
];

export function fixtureDetail(id: number): SeriesDetail | undefined {
  const s = fixtureSeries.find((x) => x.id === id);
  if (!s) return undefined;
  return {
    ...s,
    description: `Long synopsis of ${s.title}.`,
    author: 'Test Author',
    startYear: 2010,
    hydrating: false,
    volumesList: Array.from({ length: s.volumes }, (_, i) => ({
      id: i + 1,
      number: i + 1,
      title: `Volume ${i + 1}`,
      status: i < s.downloaded ? ('imported' as const) : ('wanted' as const),
      publishedAt: '2020-01-01',
      // Owned volumes carry the backing library file (the server sets this for
      // any owned volume, audio included) so they're tap-to-read in the UI.
      libraryFileId: i < s.downloaded ? 1000 + i : null,
      // First volume read, second in progress, rest unread — exercises the
      // per-volume read indicators.
      read:
        i === 0 ? ('finished' as const) : i === 1 ? ('reading' as const) : ('unread' as const),
    })),
  };
}

// --- Reader fixtures (continue-reading rail + manifests) -------------------
// Consumed by the in-app e2e fetch mock so the Maestro reader flows have a
// non-empty Continue-Reading rail and a resolvable manifest to open.

/** One in-progress comic and one in-progress audiobook, newest first. */
export const fixtureContinueReading: ContinueReadingItem[] = [
  {
    id: 1,
    readableKey: 'page:file:42',
    seriesId: 1,
    volumeId: 3,
    libraryFileId: 42,
    contentType: 'comic',
    position: 0.4,
    locatorJson: '{"page":4}',
    finished: false,
    updatedAt: '2026-05-30T10:00:00Z',
    title: 'Vinland Saga',
    coverUrl: null,
  },
  {
    id: 2,
    readableKey: 'audio:vol:5',
    seriesId: 2,
    volumeId: 5,
    libraryFileId: null,
    contentType: 'audiobook',
    position: 0.2,
    locatorJson: '{"sec":120}',
    finished: false,
    updatedAt: '2026-05-30T09:00:00Z',
    title: 'Berserk',
    coverUrl: null,
  },
];

/** A 10-page comic manifest resolved by `fileId` (paged reader). */
export const fixtureComicsManifest: ReaderManifest = {
  readableKey: 'page:file:42',
  contentType: 'comic',
  reader: 'comics',
  format: 'cbz',
  title: 'Vinland Saga',
  author: 'Makoto Yukimura',
  seriesId: 1,
  volumeId: 3,
  coverUrl: null,
  volumeLabel: 'Vol. 3',
  pageCount: 10,
  progress: {
    readableKey: 'page:file:42',
    position: 0.4,
    locator: { page: 4 },
    finished: false,
    restartedFromFinish: false,
  },
};

/** A two-track audiobook manifest resolved by `volumeId` (audio reader). */
export const fixtureAudioManifest: ReaderManifest = {
  readableKey: 'audio:vol:5',
  contentType: 'audiobook',
  reader: 'audio',
  format: 'audio',
  title: 'Berserk',
  author: 'Kentaro Miura',
  seriesId: 2,
  volumeId: 5,
  coverUrl: null,
  volumeLabel: 'Vol. 1',
  tracks: [
    { idx: 0, fileId: 101, durationSec: 300, title: 'Chapter 1' },
    { idx: 1, fileId: 102, durationSec: 360, title: 'Chapter 2' },
  ],
  chapters: [
    { title: 'Chapter 1', startSec: 0 },
    { title: 'Chapter 2', startSec: 300 },
  ],
  totalSec: 660,
  progress: {
    readableKey: 'audio:vol:5',
    position: 0.2,
    locator: { sec: 120 },
    finished: false,
    restartedFromFinish: false,
  },
};

/**
 * A MOBI ebook manifest (text reader → foliate-js WebView). No spine/toc/
 * pageCount — foliate parses + paginates the raw file client-side. Progress is
 * a 0..1 fraction (`{ frac }` locator). Carries a scoped `epubResourceToken`
 * for the download route's `?token=` auth.
 */
export const fixtureMobiManifest: ReaderManifest = {
  readableKey: 'page:file:77',
  contentType: 'ebook',
  reader: 'text',
  format: 'mobi',
  title: 'The Time Machine',
  author: 'H. G. Wells',
  seriesId: 9,
  volumeId: 11,
  coverUrl: null,
  volumeLabel: 'Vol. 1',
  epubResourceToken: 'scoped-mobi-tok',
  progress: {
    readableKey: 'page:file:77',
    position: 0.3,
    locator: { frac: 0.3 },
    finished: false,
    restartedFromFinish: false,
  },
};

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/**
 * Server-vocabulary calendar entry (light_novel / audiobook), matching the
 * web GET /api/calendar response shape BEFORE the mobile schema's ContentType
 * preprocess maps it to the short forms.
 */
export interface FixtureCalendarEntry {
  date: string;
  volumeId: number;
  volumeNumber: number;
  volumeTitle: string | null;
  seriesId: number;
  seriesTitle: string;
  contentType: 'manga' | 'comic' | 'light_novel' | 'ebook' | 'audiobook';
  coverUrl: string | null;
  author: string | null;
  publisher: string | null;
  monitoring: 'none' | 'all' | 'future' | 'missing';
}

function currentMonthYmd(day: number): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(day).padStart(2, '0')}`;
}

/**
 * Calendar entries pinned to fixed days (3rd / 15th / 22nd) of the CURRENT
 * month, so the month grid the app opens to always has seeded releases. The
 * Maestro calendar flow taps the 15th (two releases — 9101 + 9102); keep
 * those days/ids stable.
 */
export function fixtureCalendarEntries(): FixtureCalendarEntry[] {
  return [
    {
      date: currentMonthYmd(3),
      volumeId: 9100,
      volumeNumber: 28,
      volumeTitle: null,
      seriesId: 1,
      seriesTitle: 'Vinland Saga',
      contentType: 'manga',
      coverUrl: null,
      author: 'Makoto Yukimura',
      publisher: 'Kodansha',
      monitoring: 'all',
    },
    {
      date: currentMonthYmd(15),
      volumeId: 9101,
      volumeNumber: 24,
      volumeTitle: 'Town of Strife',
      seriesId: 3,
      seriesTitle: 'Spice and Wolf',
      contentType: 'light_novel',
      coverUrl: null,
      author: 'Isuna Hasekura',
      publisher: 'Yen Press',
      monitoring: 'future',
    },
    {
      date: currentMonthYmd(15),
      volumeId: 9102,
      volumeNumber: 12,
      volumeTitle: null,
      seriesId: 4,
      seriesTitle: 'Saga',
      contentType: 'comic',
      coverUrl: null,
      author: 'Brian K. Vaughan',
      publisher: 'Image Comics',
      monitoring: 'all',
    },
    {
      date: currentMonthYmd(22),
      volumeId: 9103,
      volumeNumber: 7,
      volumeTitle: null,
      seriesId: 11,
      seriesTitle: 'Dune',
      contentType: 'audiobook',
      coverUrl: null,
      author: 'Frank Herbert',
      publisher: null,
      monitoring: 'none',
    },
  ];
}

// ── Matcher replay history ────────────────────────────────────────────────────
// Shapes mirror GET /api/settings/matcher/replays (list) and
// GET /api/settings/matcher/replays/:runId (run + hydrated diff rows).

export const fixtureReplayRuns: ReplayRun[] = [
  {
    id: 12,
    triggeredAt: '2026-06-08T10:12:00.000Z',
    completedAt: '2026-06-08T10:12:41.000Z',
    status: 'completed',
    windowDays: 90,
    seriesId: null,
    releasesTotal: 184,
    releasesFlipped: 3,
    releasesRescored: 21,
    weightsSnapshotJson:
      '{"groupTopWeight":100,"groupStepDown":10,"batchBonus":50,"seederMultiplier":5,"trustedBonus":25,"remakePenalty":-30}',
    adultFilterSnapshotJson: '{"enabled":false,"blockedCategories":[]}',
    errorMessage: null,
  },
  {
    id: 11,
    triggeredAt: '2026-06-01T08:00:00.000Z',
    completedAt: '2026-06-01T08:00:03.000Z',
    status: 'failed',
    windowDays: null,
    seriesId: null,
    releasesTotal: 0,
    releasesFlipped: 0,
    releasesRescored: 0,
    weightsSnapshotJson:
      '{"groupTopWeight":100,"groupStepDown":10,"batchBonus":50,"seederMultiplier":5,"trustedBonus":25,"remakePenalty":-30}',
    adultFilterSnapshotJson: '{"enabled":false,"blockedCategories":[]}',
    errorMessage: 'release history table locked',
  },
];

export const fixtureReplayDiffs: ReplayDiffRow[] = [
  {
    id: 501,
    replayRunId: 12,
    releaseId: 9001,
    oldScore: 12,
    newScore: 91,
    oldWouldGrab: false,
    newWouldGrab: true,
    changedKind: 'flipped',
    adoptedAt: null,
    createdAt: '2026-06-08T10:12:40.000Z',
    release: {
      id: 9001,
      title: '[Ironworks] Vinland Saga v05 (2024) (Digital)',
      seriesId: 1,
      seriesTitle: 'Vinland Saga',
    },
  },
  {
    id: 502,
    replayRunId: 12,
    releaseId: 9002,
    oldScore: 74,
    newScore: 18,
    oldWouldGrab: true,
    newWouldGrab: false,
    changedKind: 'flipped',
    adoptedAt: null,
    createdAt: '2026-06-08T10:12:40.000Z',
    release: {
      id: 9002,
      title: 'Saga.v11.2023.Digital.Remake',
      seriesId: 4,
      seriesTitle: 'Saga',
    },
  },
  {
    id: 503,
    replayRunId: 12,
    releaseId: 9003,
    oldScore: 40,
    newScore: 55,
    oldWouldGrab: true,
    newWouldGrab: true,
    changedKind: 'rescored',
    adoptedAt: null,
    createdAt: '2026-06-08T10:12:40.000Z',
    release: {
      id: 9003,
      title: 'Dune Messiah (Unabridged) [Audiobook]',
      seriesId: 11,
      seriesTitle: 'Dune',
    },
  },
  {
    id: 504,
    replayRunId: 12,
    releaseId: 9004,
    oldScore: 5,
    newScore: 88,
    oldWouldGrab: false,
    newWouldGrab: true,
    changedKind: 'flipped',
    adoptedAt: '2026-06-08T11:02:00.000Z',
    createdAt: '2026-06-08T10:12:40.000Z',
    // Release row deleted since the replay ran → API hydrates null.
    release: null,
  },
];

/**
 * GET /api/profile/:userId payload (raw API shape — content types use the
 * server's vocabulary, e.g. `audiobook`, which the mobile schema maps to the
 * short forms at parse time). Keyed off `fixtureUsers`; unknown ids → null so
 * handlers can 404.
 */
export function fixtureUserProfile(userId: number): Record<string, unknown> | null {
  const u = fixtureUsers.find((x) => x.id === userId);
  if (!u) return null;
  const name = u.displayName?.trim() || u.username;
  return {
    member: {
      id: u.id,
      name,
      roleLabel: u.role === 'admin' ? 'Owner' : 'Member',
      isAdmin: u.role === 'admin',
      avatarUrl: null,
      avatarSeed: name,
      joinedLabel: 'Jan 2026',
      favType: 'manga',
    },
    // The mocked session user is id 1 (see /api/mobile/me handlers).
    isYou: u.id === 1,
    stats: { minutes: 5400, units: 132, booksFinished: 18, streakDays: 6 },
    serverRank: u.id,
    memberCount: fixtureUsers.length,
    longestStreak: 21,
    continueItems: [
      {
        readableKey: 'page:file:42',
        title: 'Vinland Saga',
        contentType: 'manga',
        coverUrl: null,
        pct: 40,
        seriesId: 1,
        volumeNumber: 3,
        volumeTitle: null,
      },
      {
        readableKey: 'audio:vol:5',
        title: 'Dune Messiah',
        contentType: 'audiobook',
        coverUrl: null,
        pct: 20,
        seriesId: 11,
        volumeNumber: null,
        volumeTitle: null,
      },
    ],
    activity: [
      {
        id: 1,
        kind: 'finished',
        seriesId: 2,
        volumeId: 5,
        seriesTitle: 'Berserk',
        coverUrl: null,
        contentType: 'manga',
        volumeNumber: 9,
        volumeTitle: null,
        createdAt: '2026-06-08T10:00:00.000Z',
      },
      {
        id: 2,
        kind: 'started',
        seriesId: 11,
        volumeId: 7,
        seriesTitle: 'Dune Messiah',
        coverUrl: null,
        contentType: 'audiobook',
        volumeNumber: null,
        volumeTitle: null,
        createdAt: '2026-06-07T09:00:00.000Z',
      },
      {
        id: 3,
        kind: 'added',
        seriesId: 3,
        volumeId: null,
        seriesTitle: 'Spice and Wolf',
        coverUrl: null,
        contentType: 'light_novel',
        volumeNumber: null,
        volumeTitle: null,
        createdAt: '2026-06-06T18:30:00.000Z',
      },
    ],
    format: {
      byType: { manga: 3200, audiobook: 1450, ebook: 750 },
      totalMinutes: 5400,
    },
    trend: [30, 60, 45, 80, 20, 55, 70, 90, 40, 65, 75, 120],
    heatmap: [],
    activeDays: 122,
    finished: [
      {
        readableKey: 'page:file:7',
        title: 'Berserk',
        contentType: 'manga',
        coverUrl: null,
        seriesId: 2,
        volumeNumber: 7,
        volumeTitle: null,
      },
      {
        readableKey: 'audio:vol:9',
        title: 'Dune',
        contentType: 'audiobook',
        coverUrl: null,
        seriesId: 11,
        volumeNumber: null,
        volumeTitle: null,
      },
    ],
    members: fixtureUsers.map((m) => ({
      id: m.id,
      name: m.displayName?.trim() || m.username,
      avatarUrl: null,
    })),
  };
}
