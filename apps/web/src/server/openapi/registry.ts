import { z } from 'zod';
import type { OperationDef } from './types';
import { ErrorResponse, MessageResponse } from './schemas/common';
import {
  ApiKeyCreateBody,
  ApiKeyCreatedResponse,
  ApiKeysListResponse,
  AuthOkResponse,
  ChangePasswordBody,
  ForwardAuthConfigPatch422,
  ForwardAuthConfigPatchBody,
  ForwardAuthConfigResponse,
  LoginBody,
  LoginResponse,
  LoginSuccessResponse,
  LoginTotpBody,
  MeDeleteBody,
  MeNotificationsPatchBody,
  MeProfilePatchBody,
  MeProfileResponse,
  MeResponse,
  NotificationPrefsResponse,
  OidcConfigPatchBody,
  OidcConfigResponse,
  OidcInfoResponse,
  OidcTestBody,
  OidcTestFailureResponse,
  OidcTestResponse,
  PasswordConfirmBody,
  RecoveryCodesResponse,
  RegisterFirstAdminBody,
  RegisterFirstAdminResponse,
  SessionsListResponse,
  TotpEnableBody,
  TotpSetupResponse,
} from './schemas/auth';
import {
  AddMemberBody,
  BookSeriesDeleteResponse,
  BookSeriesDetailResponse,
  BookSeriesListResponse,
  BookSeriesMemberDeleteResponse,
  BookSeriesRefreshResponse,
  BookSeriesSummaryResponse,
  CreateBookSeriesBody,
  UpdateBookSeriesBody,
} from './schemas/book-series';
import { BookSeriesContentType } from '@bookkeeprr/types';
import { CalendarQuery, CalendarResponse } from './schemas/calendar';
import {
  FirstRunCompleteResponse,
  FirstRunStatusResponse,
  HealthResponse,
} from './schemas/system';
import {
  UserCreateBody,
  UserCreatedResponse,
  UserOkResponse,
  UserPatchBody,
  UserResetPasswordBody,
  UsersListResponse,
} from './schemas/users';
import {
  DownloadsListResponse,
  HistoryClearResponse,
  OkResponse,
} from './schemas/downloads';
import {
  IndexerCreateBody,
  IndexerCreateResponse,
  IndexerPatchBody,
  IndexersListResponse,
  ProwlarrSyncBody,
  ProwlarrSyncResponse,
  ProwlarrTestBody,
  TorznabCapsBody,
  TorznabCapsResponse,
} from './schemas/indexers';
import {
  JobConflictResponse,
  JobEnqueuedResponse,
  JobRow,
  JobRunBody,
  JobRunResponse,
} from './schemas/jobs';
import {
  LibraryFileRerouteBody,
  LibraryFileRerouteResponse,
  LibraryGroupCreateBody,
  LibraryGroupDeleteResponse,
  LibraryGroupPatchBody,
  LibraryGroupRow,
  LibraryGroupsResponse,
  LibraryRenamePreviewResponse,
  LibrarySummaryResponse,
} from './schemas/library';
import {
  ImportAdoptBody,
  ImportAdoptResponse,
  ImportScanResponse,
} from './schemas/library-import';
import {
  QualityProfileRow,
  QualityProfilesListResponse,
} from './schemas/quality-profiles';
import {
  ReadarrAuthor,
  ReadarrAuthorLookupResult,
  ReadarrAuthorPostBody,
  ReadarrAuthorPutBody,
  ReadarrBook,
  ReadarrBookLookupResult,
  ReadarrBookPostBody,
  ReadarrBookPutBody,
  ReadarrCommandPostBody,
  ReadarrCommandRecord,
  ReadarrErrorResponse,
  ReadarrHealthResponse,
  ReadarrHistoryResponse,
  ReadarrLookupQuery,
  ReadarrMetadataProfile,
  ReadarrPaginationQuery,
  ReadarrQualityProfile,
  ReadarrQueueResponse,
  ReadarrRootFolder,
  ReadarrSystemStatusResponse,
} from './schemas/readarr';
import { ReleaseGrabResponse } from './schemas/releases';
import {
  ScanGroupConfirmResponse,
  ScanGroupMatchBody,
  ScanGroupMatchResponse,
  ScanGroupRejectResponse,
  ScanGroupsResponse,
  ScanStartBody,
} from './schemas/scan';
import {
  ApiKeyGetResponse,
  ApiKeyPatchBody,
  ApiKeyPatchResponse,
  ApiKeyTestResponse,
  AutoGrabConfigResponse,
  AutoGrabPatchBody,
  AutoGrabPatchResponse,
  ComicVinePutBody,
  ComicVineSettingsResponse,
  ComicVineTestConnectionBody,
  ConnectionTestFailureResponse,
  DiscoverPutBody,
  DiscoverSettingsResponse,
  FlaresolverrSchema,
  FlaresolverrTestBody,
  GoogleBooksPutBody,
  GoogleBooksSettingsResponse,
  HousekeepingBackupsPatchBody,
  HousekeepingBackupsPatchResponse,
  HousekeepingGetResponse,
  HousekeepingJobsPatchBody,
  HousekeepingJobsPatchResponse,
  HousekeepingReleasesPatchBody,
  HousekeepingReleasesPatchResponse,
  HousekeepingVisibilityPatchBody,
  HousekeepingVisibilityPatchResponse,
  MalPutBody,
  MalSettingsResponse,
  MalTestBody,
  MatcherAdultFilterPatchBody,
  MatcherAdultFilterPatchResponse,
  MatcherAutoReplayPatchBody,
  MatcherAutoReplayPatchResponse,
  MatcherGetResponse,
  MatcherWeightsPatchBody,
  MatcherWeightsPatchResponse,
  NamingGetResponse,
  NamingPutBody,
  NamingQuery,
  NotificationsGetResponse,
  NotificationsPatchBody,
  NotificationsTestResponse,
  NytPutBody,
  NytSettingsResponse,
  NytTestBody,
  ProwlarrSettingsPutBody,
  ProwlarrSettingsResponse,
  QbtConnectionSchema,
  QbtSettingsResponse,
  QbtTestConnectionBody,
  SearchProvidersSchema,
  SettingsOkResponse,
  StoragePutBody,
  StorageSettingsResponse,
  UpdatesPatchBody,
  UpdatesPatchResponse,
} from './schemas/settings';
import {
  AudiobookshelfGetResponse,
  AudiobookshelfLibrariesResponse,
  AudiobookshelfPatchBody,
  CalibreGetResponse,
  CalibrePatchBody,
} from './schemas/settings-library-sync';
import {
  InteractiveGrabBody,
  InteractiveSearchBody,
  InteractiveSearchFailureResponse,
  InteractiveSearchResponse,
} from './schemas/search';
import {
  ManualGrabBody,
  ManualGrabResponse,
  SeriesCreateBody,
  SeriesCreateResponse,
  SeriesDetailResponse,
  SeriesListQuery,
  SeriesListResponse,
  SeriesPatchBody,
  SeriesReleasesResponse,
  SeriesRowWithGroupPath,
  SeriesSearchBody,
  SeriesSearchPostResponse,
  SeriesSearchQuery,
  SeriesSearchResponse,
} from './schemas/series';

const SeriesIdParam = { id: z.coerce.number().int() };
const ReleaseIdParam = { id: z.coerce.number().int() };
const IndexerIdParam = { id: z.coerce.number().int() };
const QualityProfileIdParam = { id: z.coerce.number().int() };
const LibraryFileIdParam = { id: z.coerce.number().int() };
const LibraryGroupIdParam = { id: z.coerce.number().int() };
const BookSeriesIdParam = { id: z.coerce.number().int() };
const BookSeriesMemberParam = { id: z.coerce.number().int(), seriesId: z.coerce.number().int() };
const JobIdParam = { id: z.coerce.number().int() };
const DirHashParam = {
  dirHash: z
    .string()
    .describe('Directory hash from GET /api/scan/groups (`groups[n].dirHash`).'),
};
// The route handlers accept any non-empty string; the hash is whatever
// qBittorrent reports (a 40-char hex infohash in practice, not enforced).
const DownloadHashParam = {
  hash: z.string().describe('qBittorrent torrent hash (infohash)'),
};

/**
 * Every documented public operation. Family tasks append here; the drift
 * guard (tests/server/openapi/drift.test.ts) keeps this in lockstep with
 * the route files on disk.
 */
export const registry: OperationDef[] = [
  // ─── Series ─────────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/api/series',
    tag: 'Series',
    summary: 'List series, paginated, with read-state/health enrichment',
    query: SeriesListQuery,
    responses: { 200: SeriesListResponse, 400: ErrorResponse },
  },
  {
    method: 'post',
    path: '/api/series',
    tag: 'Series',
    summary: 'Add a series (per-content-type body branches)',
    description:
      'The body is a union discriminated on `contentType`. Most branches return ' +
      'the full created series row; the `light_novel` branch returns just `{ id }`. ' +
      'Every branch accepts an optional `groupId` to file the series under a ' +
      'library group (422 when the group does not exist).',
    body: SeriesCreateBody,
    responses: {
      201: SeriesCreateResponse,
      400: ErrorResponse,
      409: ErrorResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/series/search',
    tag: 'Series',
    summary: 'Metadata search across providers',
    description:
      'Federated metadata search; the provider is selected by `contentType` ' +
      '(AniList, ComicVine, OpenLibrary, Audnex). Manga responses use `hits`; ' +
      'the other content types use `results`. 503 only on `contentType=comic` ' +
      'when ComicVine is not configured.',
    query: SeriesSearchQuery,
    responses: {
      200: SeriesSearchResponse,
      400: ErrorResponse,
      502: ErrorResponse,
      503: ErrorResponse,
    },
  },
  {
    method: 'post',
    path: '/api/series/search',
    tag: 'Series',
    summary: 'Manga metadata search (legacy body-based form)',
    description:
      'Searches manga only (AniList with MangaDex completion fallback). ' +
      'Prefer `GET /api/series/search?contentType=manga`.',
    body: SeriesSearchBody,
    responses: { 200: SeriesSearchPostResponse, 400: ErrorResponse, 502: ErrorResponse },
  },
  {
    method: 'get',
    path: '/api/series/{id}',
    tag: 'Series',
    summary: 'Series detail',
    description:
      'Returns the full series row plus enrichment fields (`title`, `monitored`, ' +
      '`volumes`, `downloaded`, `groupPath`, `volumesList`). Also includes ' +
      '`hydrating: true` while any background job (metadata/volume hydrate, ' +
      'chapter sync, import) is still active for this series. Clients should ' +
      'poll until `hydrating` is false to pick up freshly-enriched data.',
    params: SeriesIdParam,
    responses: { 200: SeriesDetailResponse, 400: ErrorResponse, 404: ErrorResponse },
  },
  {
    method: 'patch',
    path: '/api/series/{id}',
    tag: 'Series',
    summary: 'Update monitoring/root/profile fields; move between library groups',
    description:
      '`groupId` moves the series into a library group (`null` ungroups); ' +
      '422 when the group does not exist.',
    params: SeriesIdParam,
    body: SeriesPatchBody,
    responses: { 200: SeriesRowWithGroupPath, 400: ErrorResponse, 404: ErrorResponse, 422: ErrorResponse },
  },
  {
    method: 'delete',
    path: '/api/series/{id}',
    tag: 'Series',
    summary: 'Delete a series',
    description:
      'Cascades to volumes, chapters, releases, downloads, and library-file ' +
      'rows. Files on disk are not touched.',
    params: SeriesIdParam,
    responses: { 204: null, 400: ErrorResponse },
  },
  {
    method: 'get',
    path: '/api/series/{id}/releases',
    tag: 'Series',
    summary: 'Releases found for the series',
    description:
      'Annotated with ownership (`none` | `in-library` | `downloading`) and ' +
      'the source indexer. Capped at the 200 most-recent rows.',
    params: SeriesIdParam,
    responses: { 200: SeriesReleasesResponse, 400: ErrorResponse, 404: ErrorResponse },
  },
  {
    method: 'post',
    path: '/api/series/{id}/manual-grab',
    tag: 'Series',
    summary: 'Grab a user-supplied magnet/torrent for the series',
    description:
      'Accepts JSON `{ magnet }` or a multipart form upload with a `torrent` ' +
      'file field (max 2 MiB). 409 when the torrent is already active or ' +
      'imported; 503 when qBittorrent is unconfigured; 502 when the qBittorrent ' +
      'add fails.',
    params: SeriesIdParam,
    body: ManualGrabBody,
    responses: {
      201: ManualGrabResponse,
      400: ErrorResponse,
      404: ErrorResponse,
      409: ErrorResponse,
      502: ErrorResponse,
      503: ErrorResponse,
    },
  },

  // ─── Search ─────────────────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/api/search/interactive',
    tag: 'Search',
    summary: 'Interactive indexer search for a series',
    description:
      'Forces a fresh poll of every enabled indexer covering the series ' +
      "content type (doesn't use cached releases). Matching results are " +
      'upserted into the releases table as a side effect, so subsequent grabs ' +
      'work. Results are sorted matches-first (score desc), then by seeders. ' +
      '502 only when every indexer failed AND zero items were collected.',
    body: InteractiveSearchBody,
    responses: {
      200: InteractiveSearchResponse,
      400: ErrorResponse,
      404: ErrorResponse,
      500: ErrorResponse,
      502: InteractiveSearchFailureResponse,
    },
  },
  {
    method: 'post',
    path: '/api/search/interactive/grab',
    tag: 'Search',
    summary: 'Force-grab an interactive search result',
    description:
      'Grabs a result straight from an interactive search — including ' +
      'non-matching results, which have no release row yet. Pass the `item` ' +
      'and `parsed` objects back verbatim from the search response; the route ' +
      'upserts the release row and sends it to qBittorrent. 409 when the ' +
      'release already has an active download; 503 when qBittorrent is ' +
      'unconfigured; 502 when the qBittorrent add fails.',
    body: InteractiveGrabBody,
    responses: {
      201: ReleaseGrabResponse,
      400: ErrorResponse,
      404: ErrorResponse,
      409: ErrorResponse,
      502: ErrorResponse,
      503: ErrorResponse,
    },
  },

  // ─── Releases ───────────────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/api/releases/{id}/grab',
    tag: 'Releases',
    summary: 'Grab a found release',
    description:
      'Sends the release to qBittorrent and inserts a download row. No request ' +
      'body. 409 when the release already has an active download; 503 when ' +
      'qBittorrent is unconfigured; 502 when the add fails or the hash never ' +
      'appears in the qBittorrent category.',
    params: ReleaseIdParam,
    responses: {
      201: ReleaseGrabResponse,
      400: ErrorResponse,
      404: ErrorResponse,
      409: ErrorResponse,
      502: ErrorResponse,
      503: ErrorResponse,
    },
  },

  // ─── Downloads ──────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/api/downloads',
    tag: 'Downloads',
    summary: 'Live downloads list',
    description:
      'Activity feed: download rows joined with their release + series, ' +
      'newest first, capped at 200. Active rows are enriched best-effort with ' +
      'live qBittorrent transfer stats (progress/speed/ETA/seeds) — null when ' +
      'qBittorrent is unconfigured or unreachable.',
    responses: { 200: DownloadsListResponse },
  },
  {
    method: 'delete',
    path: '/api/downloads/history',
    tag: 'Downloads',
    summary: 'Clear download history',
    description:
      'Admin only. Deletes all terminal download rows (completed / imported / ' +
      'failed); active rows are kept. Error responses use the `{ message }` ' +
      'envelope.',
    responses: { 200: HistoryClearResponse, 401: MessageResponse, 403: MessageResponse },
  },
  {
    method: 'delete',
    path: '/api/downloads/{hash}',
    tag: 'Downloads',
    summary: 'Remove a download',
    description:
      'Admin only. Cancels a download: removes the torrent (with files) from ' +
      'qBittorrent AND deletes the download row. Both steps are best-effort ' +
      'and idempotent — a failed qBittorrent delete still clears the row ' +
      '(200). Error responses use the `{ message }` envelope.',
    params: DownloadHashParam,
    responses: { 200: OkResponse, 401: MessageResponse, 403: MessageResponse },
  },
  {
    method: 'post',
    path: '/api/downloads/{hash}/pause',
    tag: 'Downloads',
    summary: 'Pause a download',
    description:
      'Admin only. Pauses the torrent in qBittorrent. 502 when qBittorrent is ' +
      'unconfigured or the call fails. Error responses use the `{ message }` ' +
      'envelope.',
    params: DownloadHashParam,
    responses: {
      200: OkResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/downloads/{hash}/resume',
    tag: 'Downloads',
    summary: 'Resume a download',
    description:
      'Admin only. Resumes the torrent in qBittorrent. 502 when qBittorrent ' +
      'is unconfigured or the call fails. Error responses use the ' +
      '`{ message }` envelope.',
    params: DownloadHashParam,
    responses: {
      200: OkResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/downloads/pause-all',
    tag: 'Downloads',
    summary: 'Pause everything',
    description:
      'Admin only. Pauses every torrent across the per-content-type ' +
      "'bookkeeprr-*' qBittorrent categories. 502 when qBittorrent is " +
      'unconfigured or the call fails. Error responses use the `{ message }` ' +
      'envelope.',
    responses: {
      200: OkResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: MessageResponse,
    },
  },

  // ─── Indexers ───────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/api/indexers',
    tag: 'Indexers',
    summary: 'List configured indexers',
    description:
      'Admin only. Each row carries its per-kind config as a JSON-encoded ' +
      'string in `configJson`; secrets within (filelist `passkey`, torznab ' +
      '`apiKey`) come back masked to "". The internal "manual" sentinel ' +
      'indexer (hand-added torrents) is never listed. Error responses use ' +
      'the `{ message }` envelope.',
    responses: {
      200: IndexersListResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/indexers',
    tag: 'Indexers',
    summary: 'Add an indexer',
    description:
      'Admin only. `kind` must match `configJson.kind` (mismatch → 400); a ' +
      'body that fails schema validation returns 422. 401/403 use the ' +
      '`{ message }` envelope.',
    body: IndexerCreateBody,
    responses: {
      201: IndexerCreateResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/indexers/{id}',
    tag: 'Indexers',
    summary: 'Update indexer config/enabled/name',
    description:
      'Admin only. `configJson.kind` must match the existing row (sending a ' +
      'filelist body to a nyaa row returns 400). Blank secrets ("" for ' +
      'filelist `passkey` / torznab `apiKey`) leave the stored value ' +
      'unchanged — the GET route masks secrets to "", so a save that did not ' +
      're-enter one keeps the stored secret. 401/403 use the `{ message }` ' +
      'envelope.',
    params: IndexerIdParam,
    body: IndexerPatchBody,
    responses: {
      200: OkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      404: ErrorResponse,
    },
  },
  {
    method: 'delete',
    path: '/api/indexers/{id}',
    tag: 'Indexers',
    summary: 'Delete an indexer',
    description: 'Admin only. 401/403 use the `{ message }` envelope.',
    params: IndexerIdParam,
    responses: {
      200: OkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      404: ErrorResponse,
    },
  },
  {
    method: 'post',
    path: '/api/indexers/prowlarr/sync',
    tag: 'Indexers',
    summary: 'Sync indexers from Prowlarr',
    description:
      'Admin only. When the body carries both `url` and `apiKey` the ' +
      'connection is persisted first; otherwise the stored connection is ' +
      'used. Mirrors every Prowlarr indexer as a managed torznab row ' +
      '(adds/updates/disables). 502 when Prowlarr is unreachable or not ' +
      'configured. 401/403 use the `{ message }` envelope.',
    body: ProwlarrSyncBody,
    responses: {
      200: ProwlarrSyncResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: ErrorResponse,
    },
  },
  {
    method: 'post',
    path: '/api/indexers/prowlarr/test',
    tag: 'Indexers',
    summary: 'Test the Prowlarr connection',
    description:
      'Admin only. Blank/absent `url`/`apiKey` fall back to the stored ' +
      'connection so a test works without re-entering the masked key; 400 ' +
      'when neither the body nor the store yields both. 502 when the ' +
      'connection test fails. 401/403 use the `{ message }` envelope.',
    body: ProwlarrTestBody,
    responses: {
      200: OkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: ErrorResponse,
    },
  },
  {
    method: 'post',
    path: '/api/indexers/torznab/caps',
    tag: 'Indexers',
    summary: "Probe a Torznab endpoint's caps",
    description:
      'Admin only. Fetches `t=caps` from the endpoint and returns its ' +
      'category tree. Send `apiKey: ""` plus `indexerId` to fall back to ' +
      "that row's stored key (the edit form masks it); 400 when no key is " +
      'available. 502 when the probe fails. 401/403 use the `{ message }` ' +
      'envelope.',
    body: TorznabCapsBody,
    responses: {
      200: TorznabCapsResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: ErrorResponse,
    },
  },

  // ─── Library ────────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/api/library/summary',
    security: 'bearer',
    tag: 'Library',
    summary: 'Aggregate library counts',
    description:
      'Returns `{ total, monitored, missing }` series counts. Bearer-only: ' +
      'requires a mobile API token (`Authorization: Bearer …`); session ' +
      'cookies are not accepted on this endpoint.',
    responses: { 200: LibrarySummaryResponse, 401: ErrorResponse },
  },
  {
    method: 'post',
    path: '/api/library/health-scan',
    tag: 'Library',
    summary: 'Enqueue a health scan',
    description:
      'Admin only. Enqueues a background `library_health_scan` job that opens ' +
      'every library file with the reader probers and deletes / re-grabs ' +
      'corrupt or wrong-format content. Poll `GET /api/jobs/{jobId}` for ' +
      'progress. 409 (with the existing job id) when a health scan is already ' +
      'pending/running. 401/403 use the `{ message }` envelope.',
    responses: {
      202: JobEnqueuedResponse,
      401: MessageResponse,
      403: MessageResponse,
      409: JobConflictResponse,
    },
  },
  {
    method: 'get',
    path: '/api/library/rename-all',
    tag: 'Library',
    summary: 'Preview rename-all (dry run)',
    description:
      'Admin only. Computes the rename plan for every series and returns only ' +
      'those with pending changes; nothing is written to disk. Series whose ' +
      'plan cannot be computed are skipped from the preview. 401/403 use the ' +
      '`{ message }` envelope.',
    responses: {
      200: LibraryRenamePreviewResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/library/rename-all',
    tag: 'Library',
    summary: 'Enqueue rename-all',
    description:
      'Admin only. Enqueues a background `library_rename_all` job that ' +
      're-applies the naming templates to every series on disk. Poll ' +
      '`GET /api/jobs/{jobId}` for progress. 401/403 use the `{ message }` ' +
      'envelope.',
    responses: { 202: JobEnqueuedResponse, 401: MessageResponse, 403: MessageResponse },
  },
  {
    method: 'get',
    path: '/api/library/groups',
    tag: 'Library',
    summary: 'List library groups',
    description:
      'Every group with its display `path` (ancestor names joined with ' +
      "`' / '`), RECURSIVE `seriesCount` (members of subgroups count into " +
      'the ancestor), and direct-children `subgroupCount`.',
    responses: { 200: LibraryGroupsResponse },
  },
  {
    method: 'post',
    path: '/api/library/groups',
    tag: 'Library',
    summary: 'Create a library group',
    description:
      'Admin only. Omit `parentId` for a root group. Sibling names must be ' +
      'unique — 409 on a conflict; 422 when `parentId` does not exist. ' +
      '401/403 use the `{ message }` envelope.',
    body: LibraryGroupCreateBody,
    responses: {
      201: LibraryGroupRow,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      409: ErrorResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/library/groups/{id}',
    tag: 'Library',
    summary: 'Rename / reparent a library group',
    description:
      'Admin only. Send `name` and/or `parentId` (`parentId: null` moves the ' +
      'group to the root). 409 on a sibling-name conflict; 422 when the ' +
      'reparent would create a cycle or the group/parent does not exist. ' +
      '401/403 use the `{ message }` envelope.',
    params: LibraryGroupIdParam,
    body: LibraryGroupPatchBody,
    responses: {
      200: LibraryGroupRow,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      409: ErrorResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'delete',
    path: '/api/library/groups/{id}',
    tag: 'Library',
    summary: 'Delete a library group (recursive cascade)',
    description:
      'Admin only. **Recursive cascade**: deletes the group, every subgroup ' +
      'beneath it, AND every member series record — each series goes through ' +
      'the regular series-delete path, so its volumes, files, and downloads ' +
      'cascade exactly like a manual delete. **Disk files are untouched.** ' +
      'Returns the deleted-group and deleted-series counts. 422 on an ' +
      'unknown id. 401/403 use the `{ message }` envelope.',
    params: LibraryGroupIdParam,
    responses: {
      200: LibraryGroupDeleteResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'post',
    path: '/api/library-files/{id}/reroute',
    tag: 'Library',
    summary: 'Re-route a misfiled library file',
    description:
      'Moves an existing library file to a different series and volume/chapter, ' +
      'renaming it on disk with the current naming template. Exactly one of ' +
      '`volumeNumber` / `chapterNumber` must be sent. 409 when the destination ' +
      'path already exists.',
    params: LibraryFileIdParam,
    body: LibraryFileRerouteBody,
    responses: {
      200: LibraryFileRerouteResponse,
      400: ErrorResponse,
      404: ErrorResponse,
      409: ErrorResponse,
      500: ErrorResponse,
    },
  },

  // ─── Library import ─────────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/api/library/import/scan',
    tag: 'Library',
    summary: 'Scan library roots for untracked files and suggest metadata matches',
    description:
      'Admin only. Scans every configured library root for files not yet tracked ' +
      'as library_file rows, then queries OpenLibrary and Google Books for each ' +
      'found item in parallel (capped at 8 concurrent items). Returns the full ' +
      'matched-item list for the import grid. Provider failures are swallowed — ' +
      '`best` is null and `alternatives` is empty when no match is found. ' +
      '401/403 use the `{ message }` envelope.',
    responses: {
      200: ImportScanResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/library/import',
    tag: 'Library',
    summary: 'Adopt confirmed import rows into the library',
    description:
      'Admin only. Accepts a list of confirmed import rows (each pairing an ' +
      'on-disk item with a chosen metadata candidate), then creates (or reuses) ' +
      'the series record and inserts a library_file row per file. Fully ' +
      'idempotent — re-running the same rows creates 0 new rows. Rows whose ' +
      'content type is unsupported for direct import (manga/comic) or that fail ' +
      'for any reason are skipped rather than aborting the batch — they appear ' +
      'in the `skipped` array. Returns the number of newly inserted library_file ' +
      'rows, the deduplicated series ids touched, and any skipped rows. ' +
      '401/403 use the `{ message }` envelope.',
    body: ImportAdoptBody,
    responses: {
      200: ImportAdoptResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },

  // ─── Book series ────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/api/book-series',
    tag: 'Book series',
    summary: 'List book series',
    description:
      'Returns all book series, optionally filtered by `contentType` ' +
      '(`ebook` | `audiobook`). Each entry includes `memberCount` (the number ' +
      'of library series linked to this book series). 400 when `contentType` ' +
      'is not a valid book-series content type.',
    query: z.object({ contentType: BookSeriesContentType.optional() }),
    responses: { 200: BookSeriesListResponse, 400: ErrorResponse },
  },
  {
    method: 'post',
    path: '/api/book-series',
    tag: 'Book series',
    summary: 'Create a book series',
    description:
      'Admin only. Creates a book series with `contentType` restricted to ' +
      '`ebook` or `audiobook`. `source` is set to `manual`; `memberCount` in ' +
      'the response is always `0` at creation time. ' +
      '400 on body validation failure. 401/403 use the `{ message }` envelope.',
    body: CreateBookSeriesBody,
    responses: {
      201: BookSeriesSummaryResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/book-series/{id}',
    tag: 'Book series',
    summary: 'Book series detail with merged books list',
    description:
      'Returns full detail for a book series. The `books` array merges owned ' +
      'library members with unmatched saga entries: entries matched by ' +
      '`externalRef` (isbn/asin) or title+position become owned entries; ' +
      'members with no matching entry are appended as owned orphans. The list ' +
      'is sorted by position (nulls last).',
    params: BookSeriesIdParam,
    responses: {
      200: BookSeriesDetailResponse,
      400: ErrorResponse,
      404: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/book-series/{id}',
    tag: 'Book series',
    summary: 'Update a book series',
    description:
      'Admin only. Updates `name`, `description`, and/or `coverUrl`. At least ' +
      'one field is required. 401/403 use the `{ message }` envelope.',
    params: BookSeriesIdParam,
    body: UpdateBookSeriesBody,
    responses: {
      200: BookSeriesSummaryResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      404: ErrorResponse,
    },
  },
  {
    method: 'delete',
    path: '/api/book-series/{id}',
    tag: 'Book series',
    summary: 'Delete a book series',
    description:
      'Admin only. Removes the book series, its member links, and its saga ' +
      'entries. The linked library series themselves are not deleted. ' +
      '401/403 use the `{ message }` envelope.',
    params: BookSeriesIdParam,
    responses: {
      200: BookSeriesDeleteResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      404: ErrorResponse,
    },
  },
  {
    method: 'post',
    path: '/api/book-series/{id}/members',
    tag: 'Book series',
    summary: 'Assign a library series to a book series',
    description:
      'Admin only. Idempotent upsert: re-assigning a series that is already a ' +
      'member updates its position and preserves the `manual` linkSource — never ' +
      'returns 409. Returns the refreshed detail on success. ' +
      '422 when the library series does not exist or its content type does not ' +
      'match the book series. 401/403 use the `{ message }` envelope.',
    params: BookSeriesIdParam,
    body: AddMemberBody,
    responses: {
      200: BookSeriesDetailResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'delete',
    path: '/api/book-series/{id}/members/{seriesId}',
    tag: 'Book series',
    summary: 'Unassign a library series from a book series',
    description:
      'Admin only. Removes the member link between a library series and this ' +
      'book series. Idempotent: deleting a series that is not a member is a ' +
      'no-op and returns 200. 401/403 use the `{ message }` envelope.',
    params: BookSeriesMemberParam,
    responses: {
      200: BookSeriesMemberDeleteResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/book-series/{id}/refresh',
    tag: 'Book series',
    summary: 'Trigger detection refresh for a book series (scaffold)',
    description:
      'Admin only. Enqueues a background detection refresh for the book series. ' +
      'Returns 202 immediately. ' +
      'NOTE: detection job wiring lands in a later task — this endpoint is a ' +
      'scaffold that accepts and acknowledges the request without enqueuing yet. ' +
      '401/403 use the `{ message }` envelope.',
    params: BookSeriesIdParam,
    responses: {
      202: BookSeriesRefreshResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },

  // ─── Scan ───────────────────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/api/scan',
    tag: 'Scan',
    summary: 'Kick a library scan',
    description:
      'Enqueues a `library_scan` job over `rootPath`. Poll ' +
      '`GET /api/jobs/{jobId}` until the job is terminal, then review the ' +
      'unmatched groups via `GET /api/scan/groups`. Optional `targetGroupId` ' +
      "+ `structure` ('flat' default | 'mirror') ride the scan session " +
      'through to confirm: newly created series are filed into the target ' +
      'group (flat) or into groups mirroring the folder tree under it ' +
      '(mirror); pre-existing matched series keep their group. 400 when ' +
      '`rootPath` is missing or not readable; 409 (with the existing job id) ' +
      'when a library scan is already pending/running; 422 when ' +
      '`targetGroupId` does not exist.',
    body: ScanStartBody,
    responses: {
      202: JobEnqueuedResponse,
      400: ErrorResponse,
      409: JobConflictResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/scan/groups',
    tag: 'Scan',
    summary: 'Unmatched scan groups',
    description:
      'Pending scan matches grouped by directory (one group per directory), ' +
      'sorted by `dirname`. Each group carries the proposed AniList match, ' +
      'average parser confidence, per-file parsed metadata, and ' +
      '`relativeDir` (the series dir relative to the scan root — the mirror ' +
      "import preview; '' for root-level dirs or legacy rows). Paths are " +
      'absolute host paths — scrub the response if proxying to less-trusted ' +
      'users.',
    responses: { 200: ScanGroupsResponse },
  },
  {
    method: 'post',
    path: '/api/scan/groups/{dirHash}/match',
    tag: 'Scan',
    summary: 'Attach an AniList match to a group',
    description:
      'Manual fix-up: looks up `anilistId` on AniList and stamps the match ' +
      'onto every pending row in the group (overriding the parser proposal). ' +
      '502 when the AniList lookup fails.',
    params: DirHashParam,
    body: ScanGroupMatchBody,
    responses: {
      200: ScanGroupMatchResponse,
      400: ErrorResponse,
      404: ErrorResponse,
      502: ErrorResponse,
    },
  },
  {
    method: 'post',
    path: '/api/scan/groups/{dirHash}/confirm',
    tag: 'Scan',
    summary: 'Confirm a match',
    description:
      'No request body. Imports the group into the library: creates the ' +
      'series if its AniList match is not already present (then enqueues ' +
      'metadata-hydrate jobs) and registers a library-file row per file; ' +
      'files already in the library count into `skippedCount`. A NEWLY ' +
      "created series is filed per the scan session's `targetGroupId` / " +
      '`structure` (mirror materializes the folder chain between scan root ' +
      'and series dir as nested groups, find-or-create per segment); ' +
      'pre-existing matched series keep their group. 400 when the ' +
      'group has no match attached; 404 when the group is unknown or already ' +
      'resolved.',
    params: DirHashParam,
    responses: { 200: ScanGroupConfirmResponse, 400: ErrorResponse, 404: ErrorResponse },
  },
  {
    method: 'post',
    path: '/api/scan/groups/{dirHash}/reject',
    tag: 'Scan',
    summary: 'Reject a group',
    description:
      "No request body. Marks every pending row in the group rejected so it " +
      'no longer appears in `GET /api/scan/groups`.',
    params: DirHashParam,
    responses: { 200: ScanGroupRejectResponse, 404: ErrorResponse },
  },

  // ─── Jobs ───────────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/api/jobs/{id}',
    tag: 'Jobs',
    summary: 'Job status',
    description:
      'Poll a background job. The row is returned as-is: `payloadJson` / ' +
      '`resultJson` are JSON-encoded strings; timestamps are ISO strings.',
    params: JobIdParam,
    responses: { 200: JobRow, 400: ErrorResponse, 404: ErrorResponse },
  },
  {
    method: 'post',
    path: '/api/jobs/run',
    tag: 'Jobs',
    summary: 'Run a job kind now',
    description:
      'Admin only. Drains all pending jobs of the given kind through the ' +
      'runner. Self-enqueueable kinds (`qbt_watch`, `housekeeping`) get a ' +
      'fresh empty-payload job enqueued first so this works as a "run it ' +
      'now" trigger; `import` and `library_scan` only drain what something ' +
      'else already enqueued (`ran: 0` when idle). 401/403 use the ' +
      '`{ message }` envelope.',
    body: JobRunBody,
    responses: {
      200: JobRunResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },

  // ─── Quality profiles ───────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/api/quality-profiles',
    tag: 'Quality profiles',
    summary: 'List quality profiles',
    description:
      'Returns the array directly (not wrapped). `preferredGroupsJson` / ' +
      '`preferredLanguagesJson` are JSON-encoded string arrays.',
    responses: { 200: QualityProfilesListResponse },
  },
  {
    method: 'post',
    path: '/api/quality-profiles/{id}/default',
    tag: 'Quality profiles',
    summary: 'Make a quality profile the default',
    description:
      'Admin only. Clears the default flag on every other profile and sets ' +
      'it on `id`, atomically; returns the updated row. All error responses ' +
      'on this endpoint (400/401/403/404) use the `{ message }` envelope.',
    params: QualityProfileIdParam,
    responses: {
      200: QualityProfileRow,
      400: MessageResponse,
      401: MessageResponse,
      403: MessageResponse,
      404: MessageResponse,
    },
  },

  // ─── Calendar ───────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/api/calendar',
    tag: 'Calendar',
    summary: 'Release calendar',
    description:
      'Every volume with a known release date inside the `[from, to)` window ' +
      '(`to` is EXCLUSIVE), sorted by date, then series title, then volume ' +
      'number. Dates are YYYY-MM-DD interpreted as UTC midnight. 400 when ' +
      'either bound is malformed or `to` is not after `from`.',
    query: CalendarQuery,
    responses: { 200: CalendarResponse, 400: ErrorResponse },
  },

  // ─── Settings ───────────────────────────────────────────────────────────────
  // Reads are session-gated (any authenticated user) unless noted; ALL writes
  // are admin only and return 401/403 with the `{ message }` envelope.
  {
    method: 'get',
    path: '/api/settings/qbt',
    tag: 'Settings',
    summary: 'qBittorrent connection settings',
    description: 'The stored password is masked to "****" ("" when unset).',
    responses: { 200: QbtSettingsResponse },
  },
  {
    method: 'put',
    path: '/api/settings/qbt',
    tag: 'Settings',
    summary: 'Save the qBittorrent connection',
    description:
      'Admin only. Full replace. `password: ""` keeps the stored password ' +
      '(the GET route masks it); there is no null-clear.',
    body: QbtConnectionSchema,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/naming',
    tag: 'Settings',
    summary: 'Naming templates for a content type',
    description:
      'Returns only the template keys valid for the content type ' +
      '(e.g. `chapter` only where chapters exist). `contentType` defaults to ' +
      '`manga` for back-compat.',
    query: NamingQuery,
    responses: { 200: NamingGetResponse, 400: ErrorResponse },
  },
  {
    method: 'put',
    path: '/api/settings/naming',
    tag: 'Settings',
    summary: 'Save naming templates for a content type',
    description:
      'Admin only. Only the keys valid for the content type are applied; an ' +
      'empty `volume_subfolder` flattens. Template-validation failures return ' +
      '400 with `error` and the failing `position`.',
    query: NamingQuery,
    body: NamingPutBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/comicvine',
    tag: 'Settings',
    summary: 'ComicVine API key',
    description: 'The stored key is masked to "****" ("" when unset).',
    responses: { 200: ComicVineSettingsResponse },
  },
  {
    method: 'put',
    path: '/api/settings/comicvine',
    tag: 'Settings',
    summary: 'Save the ComicVine API key',
    description:
      'Admin only. `apiKey: ""` keeps the stored key; there is no null-clear.',
    body: ComicVinePutBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/googlebooks',
    tag: 'Settings',
    summary: 'Google Books API key',
    description: 'The stored key is masked to "****" ("" when unset).',
    responses: { 200: GoogleBooksSettingsResponse },
  },
  {
    method: 'put',
    path: '/api/settings/googlebooks',
    tag: 'Settings',
    summary: 'Save the Google Books API key',
    description:
      'Admin only. `apiKey: ""` keeps the stored key; there is no null-clear.',
    body: GoogleBooksPutBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/mal',
    tag: 'Settings',
    summary: 'MyAnimeList Client ID',
    description: 'The stored Client ID is masked to "****" ("" when unset).',
    responses: { 200: MalSettingsResponse },
  },
  {
    method: 'put',
    path: '/api/settings/mal',
    tag: 'Settings',
    summary: 'Save the MyAnimeList Client ID',
    description:
      'Admin only. `clientId: ""` (or the literal "****") keeps the stored ' +
      'value; there is no null-clear.',
    body: MalPutBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/settings/mal/test',
    tag: 'Settings',
    summary: 'Test the MyAnimeList Client ID',
    description:
      'Admin only. Runs a probe search. Omit `clientId` to test the stored ' +
      'one; sending one tests it without persisting. 502 with ' +
      '`{ ok: false, error }` on failure.',
    body: MalTestBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: ConnectionTestFailureResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/nyt',
    tag: 'Settings',
    summary: 'NYT Books API key',
    description: 'The stored key is masked to "****" ("" when unset).',
    responses: { 200: NytSettingsResponse },
  },
  {
    method: 'put',
    path: '/api/settings/nyt',
    tag: 'Settings',
    summary: 'Save the NYT Books API key',
    description:
      'Admin only. `apiKey: ""` (or the literal "****") keeps the stored ' +
      'key; there is no null-clear.',
    body: NytPutBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/settings/nyt/test',
    tag: 'Settings',
    summary: 'Test the NYT Books API key',
    description:
      'Admin only. Fetches the audio bestsellers list as a probe. Omit ' +
      '`apiKey` to test the stored one. 502 with `{ ok: false, error }` on ' +
      'failure.',
    body: NytTestBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: ConnectionTestFailureResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/prowlarr',
    tag: 'Settings',
    summary: 'Prowlarr connection settings',
    description: 'The stored API key is masked to "****" ("" when unset).',
    responses: { 200: ProwlarrSettingsResponse },
  },
  {
    method: 'put',
    path: '/api/settings/prowlarr',
    tag: 'Settings',
    summary: 'Save the Prowlarr connection',
    description:
      'Admin only. `apiKey: ""` (or the literal "****") keeps the stored ' +
      'key; `url` is always applied. There is no null-clear.',
    body: ProwlarrSettingsPutBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/flaresolverr',
    tag: 'Settings',
    summary: 'FlareSolverr endpoint',
    description: 'Not a secret — the URL round-trips unmasked. "" means disabled.',
    responses: { 200: FlaresolverrSchema },
  },
  {
    method: 'put',
    path: '/api/settings/flaresolverr',
    tag: 'Settings',
    summary: 'Save the FlareSolverr endpoint',
    description: 'Admin only. Set `url: ""` to disable.',
    body: FlaresolverrSchema,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/settings/flaresolverr/test',
    tag: 'Settings',
    summary: 'Test the FlareSolverr endpoint',
    description:
      'Admin only. Solves a Cloudflare-protected probe page through the ' +
      'endpoint. Omit `url` to test the stored one. 502 with ' +
      '`{ ok: false, error }` on failure (including "not configured").',
    body: FlaresolverrTestBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: ConnectionTestFailureResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/discover',
    tag: 'Settings',
    summary: 'Discover page settings',
    responses: { 200: DiscoverSettingsResponse },
  },
  {
    method: 'put',
    path: '/api/settings/discover',
    tag: 'Settings',
    summary: 'Save the Discover trending source',
    description: 'Admin only.',
    body: DiscoverPutBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/search-providers',
    tag: 'Settings',
    summary: 'Discovery search-provider toggles',
    responses: { 200: SearchProvidersSchema },
  },
  {
    method: 'put',
    path: '/api/settings/search-providers',
    tag: 'Settings',
    summary: 'Save the discovery search-provider toggles',
    description:
      'Admin only. Strict full replace — every provider key is required and ' +
      'unknown keys are rejected.',
    body: SearchProvidersSchema,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/storage',
    tag: 'Settings',
    summary: 'Storage settings',
    description:
      'Admin only. Per-content-type library roots / qBittorrent categories, ' +
      'the torrent-cleanup policy, and the cover image cache.',
    responses: {
      200: StorageSettingsResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'put',
    path: '/api/settings/storage',
    tag: 'Settings',
    summary: 'Save storage settings',
    description:
      'Admin only. `imageCache` is optional (older clients); schema failures ' +
      'return 422.',
    body: StoragePutBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/notifications',
    tag: 'Settings',
    summary: 'Notification settings',
    description:
      'Webhook URLs are masked to "••••••••" (null when unset); the ' +
      '`*Configured` booleans report whether each transport is set up.',
    responses: { 200: NotificationsGetResponse },
  },
  {
    method: 'patch',
    path: '/api/settings/notifications',
    tag: 'Settings',
    summary: 'Save notification settings',
    description:
      'Admin only. For the webhook fields, "" keeps the stored value and ' +
      'null clears it.',
    body: NotificationsPatchBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/settings/notifications/test',
    tag: 'Settings',
    summary: 'Send a test notification',
    description:
      'No request body. Fires a synthetic event through every configured ' +
      'transport; always 200 with a per-transport result ("ok" | ' +
      '"not-configured" | `{ error }`).',
    responses: { 200: NotificationsTestResponse },
  },
  {
    method: 'get',
    path: '/api/settings/library-sync/audiobookshelf',
    tag: 'Settings',
    summary: 'Audiobookshelf sync settings',
    description: 'The stored API token is masked to "••••••••" (null when unset).',
    responses: { 200: AudiobookshelfGetResponse },
  },
  {
    method: 'patch',
    path: '/api/settings/library-sync/audiobookshelf',
    tag: 'Settings',
    summary: 'Save Audiobookshelf sync settings',
    description:
      'Admin only. For `baseUrl` / `apiToken` / `libraryId`: "" keeps the ' +
      'stored value, null clears it.',
    body: AudiobookshelfPatchBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/settings/library-sync/audiobookshelf/test',
    tag: 'Settings',
    summary: 'Test the Audiobookshelf connection',
    description:
      'No request body. Triggers a library scan on the configured server. ' +
      '503 when Audiobookshelf is not configured; 502 (with `{ error }`) ' +
      'when the scan call fails.',
    responses: { 200: SettingsOkResponse, 502: ErrorResponse, 503: ErrorResponse },
  },
  {
    method: 'get',
    path: '/api/settings/library-sync/audiobookshelf/libraries',
    tag: 'Settings',
    summary: 'List Audiobookshelf libraries',
    description:
      'For the library-picker dropdown. 503 when Audiobookshelf is not ' +
      'configured; 502 (with `{ error }`) when the listing fails.',
    responses: {
      200: AudiobookshelfLibrariesResponse,
      502: ErrorResponse,
      503: ErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/library-sync/calibre',
    tag: 'Settings',
    summary: 'Calibre sync settings',
    description: 'The stored password is masked to "••••••••" (null when unset).',
    responses: { 200: CalibreGetResponse },
  },
  {
    method: 'patch',
    path: '/api/settings/library-sync/calibre',
    tag: 'Settings',
    summary: 'Save Calibre sync settings',
    description:
      'Admin only. For `baseUrl` / `username` / `password`: "" keeps the ' +
      'stored value, null clears it.',
    body: CalibrePatchBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/settings/library-sync/calibre/test',
    tag: 'Settings',
    summary: 'Test the Calibre connection',
    description:
      'No request body. Triggers a content-server library refresh. 503 when ' +
      'Calibre is not configured; 502 (with `{ error }`, e.g. ' +
      '"unsupported-version" for content-servers older than v6) when the ' +
      'refresh fails.',
    responses: { 200: SettingsOkResponse, 502: ErrorResponse, 503: ErrorResponse },
  },
  {
    method: 'get',
    path: '/api/settings/api-key',
    tag: 'Settings',
    summary: 'API key status',
    description:
      'Unlike the other settings secrets, the key is returned in PLAINTEXT ' +
      'when enabled (the admin UI shows it for copy/paste); "" when disabled.',
    responses: { 200: ApiKeyGetResponse },
  },
  {
    method: 'patch',
    path: '/api/settings/api-key',
    tag: 'Settings',
    summary: 'Generate or disable the API key',
    description:
      'Admin only. `action: "generate"` rotates and returns the new ' +
      'plaintext key; `action: "disable"` clears it (every /api/* request ' +
      'becomes open again).',
    body: ApiKeyPatchBody,
    responses: {
      200: ApiKeyPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/settings/api-key/test',
    tag: 'Settings',
    summary: 'Validate an X-Api-Key header',
    description:
      'No request body — send the candidate key as the `X-Api-Key` header. ' +
      'When no key is configured the response carries a `note` saying auth ' +
      'is disabled. 401 `{ ok: false, error }` on mismatch.',
    responses: { 200: ApiKeyTestResponse, 401: ConnectionTestFailureResponse },
  },
  {
    method: 'get',
    path: '/api/settings/auto-grab',
    tag: 'Settings',
    summary: 'Auto-grab settings',
    description: 'Admin only. Returns the config blob bare (currently `{ dryRun }`).',
    responses: {
      200: AutoGrabConfigResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/auto-grab',
    tag: 'Settings',
    summary: 'Save auto-grab settings',
    description:
      'Admin only. Strict partial merge; schema failures return 422.',
    body: AutoGrabPatchBody,
    responses: {
      200: AutoGrabPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/housekeeping',
    tag: 'Settings',
    summary: 'Housekeeping retention settings',
    description:
      'Admin only. All four retention blobs (jobs / backups / visibility / ' +
      'releases); each is written via its own PATCH subroute.',
    responses: {
      200: HousekeepingGetResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/housekeeping/jobs',
    tag: 'Settings',
    summary: 'Save job retention',
    description: 'Admin only. Strict partial merge; schema failures return 422.',
    body: HousekeepingJobsPatchBody,
    responses: {
      200: HousekeepingJobsPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/housekeeping/backups',
    tag: 'Settings',
    summary: 'Save backup retention',
    description: 'Admin only. Strict partial merge; schema failures return 422.',
    body: HousekeepingBackupsPatchBody,
    responses: {
      200: HousekeepingBackupsPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/housekeeping/releases',
    tag: 'Settings',
    summary: 'Save release retention',
    description: 'Admin only. Strict partial merge; schema failures return 422.',
    body: HousekeepingReleasesPatchBody,
    responses: {
      200: HousekeepingReleasesPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/housekeeping/visibility',
    tag: 'Settings',
    summary: 'Save audit/log retention',
    description: 'Admin only. Strict partial merge; schema failures return 422.',
    body: HousekeepingVisibilityPatchBody,
    responses: {
      200: HousekeepingVisibilityPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/updates',
    tag: 'Settings',
    summary: 'Save update-check settings',
    description: 'Admin only. Strict partial merge; schema failures return 422.',
    body: UpdatesPatchBody,
    responses: {
      200: UpdatesPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/settings/matcher',
    tag: 'Settings',
    summary: 'Matcher settings',
    description: 'Admin only. Scoring weights + the adult-content filter.',
    responses: {
      200: MatcherGetResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/matcher/weights',
    tag: 'Settings',
    summary: 'Save matcher scoring weights',
    description:
      'Admin only. Strict partial merge; schema failures return 422. When ' +
      '"auto-replay on save" is enabled, the response also reports the ' +
      'enqueued replay run (or its error).',
    body: MatcherWeightsPatchBody,
    responses: {
      200: MatcherWeightsPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/matcher/adult-filter',
    tag: 'Settings',
    summary: 'Save the adult-content filter',
    description:
      'Admin only. Strict partial merge; schema failures return 422. When ' +
      '"auto-replay on save" is enabled, the response also reports the ' +
      'enqueued replay run (or its error).',
    body: MatcherAdultFilterPatchBody,
    responses: {
      200: MatcherAdultFilterPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/settings/matcher/auto-replay',
    tag: 'Settings',
    summary: 'Toggle auto-replay-on-save',
    description: 'Admin only. Schema failures return 422.',
    body: MatcherAutoReplayPatchBody,
    responses: {
      200: MatcherAutoReplayPatchResponse,
      400: ErrorResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ErrorResponse,
    },
  },

  // ─── Connection tests ───────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/api/qbt/test-connection',
    tag: 'Connection tests',
    summary: 'Test a qBittorrent connection',
    description:
      'Probes the qBittorrent WebUI with the submitted connection. ' +
      '`password` blank/absent falls back to the stored password (the ' +
      'settings GET masks it). 502 with `{ ok: false, error }` on failure.',
    body: QbtTestConnectionBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      502: ConnectionTestFailureResponse,
    },
  },
  {
    method: 'post',
    path: '/api/comicvine/test-connection',
    tag: 'Connection tests',
    summary: 'Test a ComicVine API key',
    description:
      'Validates the key against ComicVine. `apiKey` blank/absent falls ' +
      'back to the stored key; 400 when neither yields one. 502 with ' +
      '`{ ok: false, error }` on failure.',
    body: ComicVineTestConnectionBody,
    responses: {
      200: SettingsOkResponse,
      400: ErrorResponse,
      502: ConnectionTestFailureResponse,
    },
  },

  // ─── Auth ───────────────────────────────────────────────────────────────────
  // The reverse-proxy gate (src/proxy.ts) exempts ALL of /api/auth/* — every
  // handler self-gates. Ops marked `open: true` are genuinely reachable with
  // no credentials; the rest require a session COOKIE specifically unless the
  // description says otherwise (bearer tokens work only where noted). Errors
  // in this family use the `{ message }` envelope throughout.
  {
    method: 'post',
    path: '/api/auth/register-first-admin',
    tag: 'Auth',
    summary: 'Create the first admin account',
    description:
      'Only works while ZERO users exist (409 afterwards). The email doubles ' +
      'as the username. Sets the session cookie on success.',
    open: true,
    body: RegisterFirstAdminBody,
    responses: {
      201: RegisterFirstAdminResponse,
      400: MessageResponse,
      409: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/auth/login',
    tag: 'Auth',
    summary: 'Sign in with username + password',
    description:
      'Accepts JSON or a classic form POST. Two 200 shapes: `{ user, … }` ' +
      '(session cookie set) or `{ requiresTotp, challengeToken }` when the ' +
      'account has 2FA — complete via POST /api/auth/login/totp. Mobile ' +
      'onboarding: a `bookkeeprr://` `return_to` yields `redirect_to` with a ' +
      'one-time exchange code (non-JSON form posts get a real 302 instead). ' +
      '400 is `{ message }` for body errors but `{ error }` for a bad ' +
      '`return_to` scheme.',
    open: true,
    body: LoginBody,
    responses: {
      200: LoginResponse,
      400: z.union([MessageResponse, ErrorResponse]),
      401: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/auth/login/totp',
    tag: 'Auth',
    summary: 'Complete the TOTP login challenge',
    description:
      'Exchanges the `challengeToken` from POST /api/auth/login plus a ' +
      '6-digit TOTP code (or a `xxxx-xxxx-xxxx` recovery code, consumed on ' +
      'use) for a session cookie.',
    open: true,
    body: LoginTotpBody,
    responses: {
      200: LoginSuccessResponse,
      400: MessageResponse,
      401: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/auth/logout',
    tag: 'Auth',
    summary: 'Sign out',
    description:
      'Revokes the current session (if any) and clears the cookie. Always ' +
      '204 — safe to call without a session.',
    open: true,
    responses: { 204: null },
  },
  {
    method: 'post',
    path: '/api/auth/logout/all',
    tag: 'Auth',
    summary: 'Sign out everywhere',
    description:
      'Session-cookie only. Revokes EVERY session of the current user ' +
      '(including this one) and clears the cookie.',
    responses: { 200: AuthOkResponse, 401: MessageResponse },
  },
  {
    method: 'get',
    path: '/api/auth/me',
    tag: 'Auth',
    summary: 'Current user',
    description:
      'Probe endpoint: returns `{ user }` with the session user when ' +
      'authenticated, or `{ user: null }` with HTTP 200 (never 401) when ' +
      'there is no valid session — safe to call without credentials. ' +
      '`totpEnabledAt` is epoch milliseconds, unlike the ISO timestamps elsewhere.',
    open: true,
    responses: { 200: MeResponse },
  },
  {
    method: 'delete',
    path: '/api/auth/me',
    tag: 'Auth',
    summary: 'Delete my account',
    description:
      'Session-cookie only; local accounts only (OIDC/forward-auth → 400). ' +
      'Requires the current password; cascades sessions and per-user data ' +
      'and clears the cookie.',
    body: MeDeleteBody,
    responses: { 200: AuthOkResponse, 400: MessageResponse, 401: MessageResponse },
  },
  {
    method: 'patch',
    path: '/api/auth/me/profile',
    tag: 'Auth',
    summary: 'Update display name / email',
    description: 'Session-cookie only. "" clears a field (stored as null).',
    body: MeProfilePatchBody,
    responses: { 200: MeProfileResponse, 400: MessageResponse, 401: MessageResponse },
  },
  {
    method: 'get',
    path: '/api/auth/me/notifications',
    tag: 'Auth',
    summary: 'My notification preferences',
    description: 'Session-cookie only. Creates the row with defaults on first read.',
    responses: { 200: NotificationPrefsResponse, 401: MessageResponse },
  },
  {
    method: 'patch',
    path: '/api/auth/me/notifications',
    tag: 'Auth',
    summary: 'Update my notification preferences',
    description: 'Session-cookie only. Strict partial merge (unknown keys → 400).',
    body: MeNotificationsPatchBody,
    responses: {
      200: NotificationPrefsResponse,
      400: MessageResponse,
      401: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/auth/me/api-keys',
    tag: 'Auth',
    summary: 'List my personal API keys',
    description:
      'Any user credential works (cookie, bearer, personal API key); the ' +
      'X-Api-Key "system" actor is rejected. Secrets are never re-shown — ' +
      'only the display prefix.',
    responses: { 200: ApiKeysListResponse, 401: MessageResponse },
  },
  {
    method: 'post',
    path: '/api/auth/me/api-keys',
    tag: 'Auth',
    summary: 'Create a personal API key',
    description:
      'Returns the full `bkr_…` key in `plaintext` ONCE; only the prefix is ' +
      'stored for display. Use it as `Authorization: Bearer bkr_…`.',
    body: ApiKeyCreateBody,
    responses: {
      201: ApiKeyCreatedResponse,
      400: MessageResponse,
      401: MessageResponse,
    },
  },
  {
    method: 'delete',
    path: '/api/auth/me/api-keys/{id}',
    tag: 'Auth',
    summary: 'Revoke a personal API key',
    params: { id: z.coerce.number().int() },
    responses: {
      200: AuthOkResponse,
      400: MessageResponse,
      401: MessageResponse,
      404: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/auth/me/totp/setup',
    tag: 'Auth',
    summary: 'Start 2FA setup',
    description:
      'Local accounts only (400 otherwise). Generates a secret + recovery ' +
      'codes WITHOUT persisting — enable via POST /api/auth/me/totp/enable.',
    responses: { 200: TotpSetupResponse, 400: MessageResponse, 401: MessageResponse },
  },
  {
    method: 'post',
    path: '/api/auth/me/totp/enable',
    tag: 'Auth',
    summary: 'Enable 2FA',
    description:
      'Echo the /setup payload back with a valid current code. 422 when the ' +
      'code does not verify against the secret.',
    body: TotpEnableBody,
    responses: {
      200: AuthOkResponse,
      400: MessageResponse,
      401: MessageResponse,
      422: MessageResponse,
    },
  },
  {
    method: 'delete',
    path: '/api/auth/me/totp',
    tag: 'Auth',
    summary: 'Disable 2FA',
    description:
      'Requires the current local password (401 on mismatch). Clears the ' +
      'secret and recovery codes.',
    body: PasswordConfirmBody,
    responses: { 200: AuthOkResponse, 400: MessageResponse, 401: MessageResponse },
  },
  {
    method: 'post',
    path: '/api/auth/me/totp/recovery-codes/regenerate',
    tag: 'Auth',
    summary: 'Regenerate 2FA recovery codes',
    description:
      'Requires the current local password and 2FA enabled. Returns 10 fresh ' +
      'plaintext codes (shown once); the old codes stop working.',
    body: PasswordConfirmBody,
    responses: { 200: RecoveryCodesResponse, 400: MessageResponse, 401: MessageResponse },
  },
  {
    method: 'post',
    path: '/api/auth/change-password',
    tag: 'Auth',
    summary: 'Change my password',
    description:
      'Session-cookie only; local accounts only. `currentPassword` is ' +
      'required unless the account is flagged `mustChangePassword`. Revokes ' +
      'every session and issues a fresh cookie for this client.',
    body: ChangePasswordBody,
    responses: { 200: AuthOkResponse, 400: MessageResponse, 401: MessageResponse },
  },
  {
    method: 'get',
    path: '/api/auth/sessions',
    tag: 'Auth',
    summary: 'List my sessions',
    description:
      'Session-cookie only. `id` is the first 12 chars of each session ' +
      'token — the handle for DELETE /api/auth/sessions/{tokenPrefix}.',
    responses: { 200: SessionsListResponse, 401: MessageResponse },
  },
  {
    method: 'delete',
    path: '/api/auth/sessions/{tokenPrefix}',
    tag: 'Auth',
    summary: 'Revoke another session',
    description:
      'Session-cookie only. 400 when the prefix matches the CURRENT session ' +
      '(use logout); 409 when the prefix is ambiguous — send more characters.',
    params: {
      tokenPrefix: z.string().describe('Session-token prefix from GET /api/auth/sessions.'),
    },
    responses: {
      200: AuthOkResponse,
      400: MessageResponse,
      401: MessageResponse,
      404: MessageResponse,
      409: MessageResponse,
    },
  },
  {
    method: 'get',
    path: '/api/auth/oidc/info',
    tag: 'Auth',
    summary: 'OIDC login-button hint',
    description:
      'For the login page: whether SSO is enabled (and configured) plus the ' +
      'button label. No secrets.',
    open: true,
    responses: { 200: OidcInfoResponse },
  },
  {
    method: 'get',
    path: '/api/auth/oidc/config',
    tag: 'Auth',
    summary: 'OIDC SSO configuration',
    description: 'Admin only. `clientSecret` is masked to "••••••••" ("" when unset).',
    responses: { 200: OidcConfigResponse, 401: MessageResponse, 403: MessageResponse },
  },
  {
    method: 'patch',
    path: '/api/auth/oidc/config',
    tag: 'Auth',
    summary: 'Save the OIDC SSO configuration',
    description:
      'Admin only. Partial merge. For `clientSecret`: "" keeps the stored ' +
      'secret, null clears it AND force-disables OIDC, a real value rotates.',
    body: OidcConfigPatchBody,
    responses: {
      200: OidcConfigResponse,
      400: MessageResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/auth/oidc/test',
    tag: 'Auth',
    summary: 'Test OIDC discovery',
    description:
      'Admin only. Runs issuer discovery with the submitted (or stored) ' +
      'client secret; blank/masked secret falls back to the stored one. 502 ' +
      'with `{ ok: false, error: "discovery_failed", detail }` on failure.',
    body: OidcTestBody,
    responses: {
      200: OidcTestResponse,
      400: MessageResponse,
      401: MessageResponse,
      403: MessageResponse,
      502: OidcTestFailureResponse,
    },
  },
  {
    method: 'get',
    path: '/api/auth/forward-auth/config',
    tag: 'Auth',
    summary: 'Forward-auth configuration',
    description: 'Admin only. Nothing here is a secret — round-trips unmasked.',
    responses: {
      200: ForwardAuthConfigResponse,
      401: MessageResponse,
      403: MessageResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/auth/forward-auth/config',
    tag: 'Auth',
    summary: 'Save the forward-auth configuration',
    description:
      'Admin only. Partial merge. 422 on invalid CIDRs, or — when flipping ' +
      '`enabled` on — when the CURRENT request does not already arrive via a ' +
      'trusted proxy with the user header set (lockout guard; the 422 body ' +
      'is the readiness report).',
    body: ForwardAuthConfigPatchBody,
    responses: {
      200: ForwardAuthConfigResponse,
      400: MessageResponse,
      401: MessageResponse,
      403: MessageResponse,
      422: ForwardAuthConfigPatch422,
    },
  },

  // ─── Users ──────────────────────────────────────────────────────────────────
  // Admin user management. All admin only; errors use the `{ message }`
  // envelope (including 400/404/409).
  {
    method: 'get',
    path: '/api/users',
    tag: 'Users',
    summary: 'List users',
    description:
      'Admin only. Full user rows minus the password hash; the avatar is ' +
      'exposed as `avatarUrl`.',
    responses: { 200: UsersListResponse, 401: MessageResponse, 403: MessageResponse },
  },
  {
    method: 'post',
    path: '/api/users',
    tag: 'Users',
    summary: 'Create a user',
    description:
      'Admin only. `mustChangePassword` defaults to true (the user is forced ' +
      'to set their own password on first login). 409 on a duplicate ' +
      'username. Unlike the list view, the created row carries the raw ' +
      '`avatarPath` (null) instead of `avatarUrl`.',
    body: UserCreateBody,
    responses: {
      201: UserCreatedResponse,
      400: MessageResponse,
      401: MessageResponse,
      403: MessageResponse,
      409: MessageResponse,
    },
  },
  {
    method: 'patch',
    path: '/api/users/{id}',
    tag: 'Users',
    summary: 'Update role / disabled',
    description:
      'Admin only. Disabling revokes all of the target’s sessions. 409 ' +
      'guards: cannot demote or disable the last active admin; cannot ' +
      'disable your own account.',
    params: { id: z.coerce.number().int() },
    body: UserPatchBody,
    responses: {
      200: UserOkResponse,
      400: MessageResponse,
      401: MessageResponse,
      403: MessageResponse,
      404: MessageResponse,
      409: MessageResponse,
    },
  },
  {
    method: 'delete',
    path: '/api/users/{id}',
    tag: 'Users',
    summary: 'Delete a user',
    description:
      'Admin only. 409 guards: cannot delete your own account or the last ' +
      'active admin.',
    params: { id: z.coerce.number().int() },
    responses: {
      204: null,
      400: MessageResponse,
      401: MessageResponse,
      403: MessageResponse,
      404: MessageResponse,
      409: MessageResponse,
    },
  },
  {
    method: 'post',
    path: '/api/users/{id}/reset-password',
    tag: 'Users',
    summary: 'Reset a user’s password',
    description:
      'Admin only. Sets the new password, revokes all of the target’s ' +
      'sessions, and (by default) forces a change on next login.',
    params: { id: z.coerce.number().int() },
    body: UserResetPasswordBody,
    responses: {
      200: UserOkResponse,
      400: MessageResponse,
      401: MessageResponse,
      403: MessageResponse,
      404: MessageResponse,
    },
  },

  // ─── System ─────────────────────────────────────────────────────────────────
  // Health probe + first-run wizard. All permanently exempt from the auth
  // gate (src/proxy.ts) — reachable with no credentials.
  {
    method: 'get',
    path: '/api/health',
    tag: 'System',
    summary: 'Health probe',
    description:
      'Container/liveness probe keyed on the background worker heartbeat: ' +
      '200 while the heartbeat is fresh (≤ 3 min), 503 with the SAME body ' +
      'shape when stale or absent.',
    open: true,
    responses: { 200: HealthResponse, 503: HealthResponse },
  },
  {
    method: 'get',
    path: '/api/first-run/status',
    tag: 'System',
    summary: 'First-run wizard status',
    open: true,
    responses: { 200: FirstRunStatusResponse },
  },
  {
    method: 'post',
    path: '/api/first-run/complete',
    tag: 'System',
    summary: 'Mark the first-run wizard complete',
    description:
      'No request body. Idempotent. The endpoint is permanently unauthenticated — ' +
      'the reverse-proxy gate exempts `/api/first-run/*` even after setup completes, ' +
      'so calling it post-setup is harmless.',
    open: true,
    responses: { 200: FirstRunCompleteResponse },
  },
  {
    method: 'get',
    path: '/api/openapi.json',
    tag: 'System',
    summary: 'OpenAPI 3.1 document for this instance',
    description:
      'Returns the live OpenAPI 3.1 document generated from the registry. ' +
      // Documenting the full doc shape recursively in the schema is noise —
      // callers know what an OpenAPI document looks like; we just confirm openapi version.
      'The response body shape is the full OpenAPI 3.1 object; only the top-level ' +
      '`openapi` version field is modelled here.',
    responses: {
      200: z.object({ openapi: z.string().describe('OpenAPI version string, e.g. "3.1.0"') }),
    },
  },

  // ─── Readarr compat ─────────────────────────────────────────────────────────
  // The Calibre-Web-targeted /api/readarr/v1/* adapter (docs/api.md →
  // "Readarr-compatible surface"). Same global auth gate as the native
  // surface — session cookie OR X-Api-Key both work (compat clients send
  // X-Api-Key) — so the global security default stands. Errors use Readarr's
  // `{ message, description? }` envelope, not the native `{ error }` one.
  {
    method: 'get',
    path: '/api/readarr/v1/system/status',
    tag: 'Readarr compat',
    summary: 'Connection test',
    responses: { 200: ReadarrSystemStatusResponse },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/qualityprofile',
    tag: 'Readarr compat',
    summary: 'Quality profiles, Readarr-shaped',
    responses: { 200: z.array(ReadarrQualityProfile) },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/metadataprofile',
    tag: 'Readarr compat',
    summary: 'The five content-type profiles',
    description: 'Static list: 1=ebook, 2=audiobook, 3=light_novel, 4=manga, 5=comic.',
    responses: { 200: z.array(ReadarrMetadataProfile) },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/rootfolder',
    tag: 'Readarr compat',
    summary: 'Media roots, one per content type',
    responses: { 200: z.array(ReadarrRootFolder) },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/author',
    tag: 'Readarr compat',
    summary: 'Authors (= bookkeeprr series), all 5 content types',
    description: 'Returns up to 500 series, title-ascending, each with its books (volumes).',
    responses: { 200: z.array(ReadarrAuthor) },
  },
  {
    method: 'post',
    path: '/api/readarr/v1/author',
    tag: 'Readarr compat',
    summary: 'Add a series to monitoring',
    description:
      '`metadataProfileId` selects the content type; `foreignAuthorId` is the ' +
      'provider id (see the body schema). 409 when the series already exists.',
    body: ReadarrAuthorPostBody,
    responses: {
      201: ReadarrAuthor,
      400: ReadarrErrorResponse,
      409: ReadarrErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/author/{id}',
    tag: 'Readarr compat',
    summary: 'Single author detail',
    params: { id: z.coerce.number().int() },
    responses: { 200: ReadarrAuthor, 400: ReadarrErrorResponse, 404: ReadarrErrorResponse },
  },
  {
    method: 'put',
    path: '/api/readarr/v1/author/{id}',
    tag: 'Readarr compat',
    summary: 'Update rootFolderPath / monitored / qualityProfileId',
    params: { id: z.coerce.number().int() },
    body: ReadarrAuthorPutBody,
    responses: { 200: ReadarrAuthor, 400: ReadarrErrorResponse, 404: ReadarrErrorResponse },
  },
  {
    method: 'delete',
    path: '/api/readarr/v1/author/{id}',
    tag: 'Readarr compat',
    summary: 'Delete the bookkeeprr series (files on disk untouched)',
    params: { id: z.coerce.number().int() },
    responses: { 204: null, 400: ReadarrErrorResponse, 404: ReadarrErrorResponse },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/author/lookup',
    tag: 'Readarr compat',
    summary: 'Federated metadata search, Author-shaped',
    description: 'Searches all five metadata providers; results are not yet in the library.',
    query: ReadarrLookupQuery,
    responses: { 200: z.array(ReadarrAuthorLookupResult), 400: ReadarrErrorResponse },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/book',
    tag: 'Readarr compat',
    summary: 'Books (= volumes of all series)',
    responses: { 200: z.array(ReadarrBook) },
  },
  {
    method: 'post',
    path: '/api/readarr/v1/book',
    tag: 'Readarr compat',
    summary: 'Add a single-volume series',
    description:
      'Creates a series with one volume. 409 when a series with the same ' +
      'provider id already exists.',
    body: ReadarrBookPostBody,
    responses: {
      201: ReadarrBook,
      400: ReadarrErrorResponse,
      409: ReadarrErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/book/{id}',
    tag: 'Readarr compat',
    summary: 'Single book detail',
    params: { id: z.coerce.number().int() },
    responses: { 200: ReadarrBook, 400: ReadarrErrorResponse, 404: ReadarrErrorResponse },
  },
  {
    method: 'put',
    path: '/api/readarr/v1/book/{id}',
    tag: 'Readarr compat',
    summary: 'Update the volume title',
    description: '`monitored` is accepted and silently ignored.',
    params: { id: z.coerce.number().int() },
    body: ReadarrBookPutBody,
    responses: { 200: ReadarrBook, 400: ReadarrErrorResponse, 404: ReadarrErrorResponse },
  },
  {
    method: 'delete',
    path: '/api/readarr/v1/book/{id}',
    tag: 'Readarr compat',
    summary: 'Delete the volume; the series stays',
    params: { id: z.coerce.number().int() },
    responses: { 204: null, 400: ReadarrErrorResponse, 404: ReadarrErrorResponse },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/book/lookup',
    tag: 'Readarr compat',
    summary: 'Federated metadata search, Book-shaped',
    query: ReadarrLookupQuery,
    responses: { 200: z.array(ReadarrBookLookupResult), 400: ReadarrErrorResponse },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/command',
    tag: 'Readarr compat',
    summary: 'Recent jobs in Readarr command shape (last 50)',
    responses: { 200: z.array(ReadarrCommandRecord) },
  },
  {
    method: 'post',
    path: '/api/readarr/v1/command',
    tag: 'Readarr compat',
    summary: 'Dispatch a Readarr command to bookkeeprr’s job kinds',
    description:
      'Always 201. Refresh*/…Search (with `authorId`) and RescanFolders enqueue a ' +
      'job — the record’s `id` is the bookkeeprr jobId and `message` the job kind; ' +
      'anything else (including an empty body) returns a synthetic `completed` ' +
      'no-op record with `id` 0.',
    body: ReadarrCommandPostBody,
    responses: { 201: ReadarrCommandRecord },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/command/{id}',
    tag: 'Readarr compat',
    summary: 'Single command status (= bookkeeprr job)',
    params: { id: z.coerce.number().int() },
    responses: {
      200: ReadarrCommandRecord,
      400: ReadarrErrorResponse,
      404: ReadarrErrorResponse,
    },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/queue',
    tag: 'Readarr compat',
    summary: 'Live downloads, paginated',
    description:
      'Downloads with status != imported/superseded. Invalid pagination ' +
      'params fall back to the defaults rather than erroring.',
    query: ReadarrPaginationQuery,
    responses: { 200: ReadarrQueueResponse },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/history',
    tag: 'Readarr compat',
    summary: 'Grabbed + imported + failed events, paginated',
    description:
      'Union of grabbed / bookFileImported / downloadFailed events, newest ' +
      'first, capped at the most recent 1000.',
    query: ReadarrPaginationQuery,
    responses: { 200: ReadarrHistoryResponse },
  },
  {
    method: 'get',
    path: '/api/readarr/v1/health',
    tag: 'Readarr compat',
    summary: 'Health stub',
    description: 'Always `[]` — Readarr clients only check the shape.',
    responses: { 200: ReadarrHealthResponse },
  },
];
