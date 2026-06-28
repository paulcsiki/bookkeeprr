# bookkeeprr HTTP API

Reference for the **native** bookkeeprr REST API. This is the surface the bundled UI uses - 134 documented operations across 101 paths today, organized by resource family (plus the 22-operation Readarr-compatible adapter over 15 paths, below). The machine-readable source of truth is the generated OpenAPI document (`src/server/openapi/` in the repo); this file carries the prose, conventions, and quirks.

> **Status:** internal-ish but stable. The shapes documented here mirror what the UI ships against. Inconsistencies that exist for historical reasons are flagged at the bottom rather than papered over - see [Quirks & inconsistencies](#quirks--inconsistencies).
>
> **Readarr compatibility:** a `/api/readarr/v1/*` adapter that maps bookkeeprr resources to Readarr's shapes ships alongside the native API - see [Readarr-compatible surface](#readarr-compatible-surface-apireadarrv1). Compat clients typically authenticate with the `X-Api-Key` header (session cookie also accepted; see [Readarr-compatible surface → Authentication](#authentication-1)).

## Conventions

**Base URL.** Whatever you bound `BOOKKEEPRR_PORT` to - by default `http://localhost:3000`. All paths below are relative to that origin.

**Authentication.** Parallel modes:

- **Personal API key bearer token** (`Authorization: Bearer bkr_…`) - the recommended mode for scripts and API clients. Keys are created under **Account → API keys** and act as the owning user. This is the mode the generated OpenAPI reference advertises.
- **`X-Api-Key` header** - the static system key, used by Readarr-compat clients. Generated under Settings → API Access.
- **Session cookie** (`bookkeeprr_session`) - used by the bundled UI. Created via `POST /api/auth/login`; cleared via `POST /api/auth/logout`. HttpOnly, SameSite=Lax, 30-day rolling expiry. An internal detail of the UI - don't build API clients on it.

Once any user exists (the first-run wizard's "Create admin" step has completed), **both surfaces** (`/api/*` and `/api/readarr/v1/*`) require **one** of the modes. Bare requests get 401. `/api/health`, `/api/first-run/*`, and `/api/auth/*` stay open.

**OpenID Connect (OIDC).** When OIDC is configured in **Settings → Authentication**, the `/login` page renders a "Sign in with …" button below the local form. The browser flow is:

1. `POST /api/auth/oidc/start` → 302 to the IdP's authorization endpoint with PKCE (`code_challenge_method=S256`), `state`, and `nonce`. A short-lived HMAC-signed `bookkeeprr_oidc_pending` cookie carries the verifier and expected state/nonce.
2. The IdP redirects back to `/api/auth/oidc/callback?code=…&state=…`. bookkeeprr validates the ID token (signature, `iss`, `aud`, `exp`, `nonce`), resolves the user by `(oidc_issuer, oidc_subject)`, and either auto-creates them (gated by `allowedGroups`) or reuses the existing row.
3. Admin role is recomputed from `adminGroups` membership on every login. The last-admin guard prevents demoting the only remaining admin.
4. On success: a 30-day rolling `bookkeeprr_session` cookie is set; the user is redirected to the original `?next=` target or `/`.
5. OIDC is auth-only - bookkeeprr never uses the access token for downstream calls and does not store refresh tokens.

The Readarr-compatible `/api/readarr/v1/*` surface passes through the same auth gate as the native surface - a session cookie or `X-Api-Key` both work. OIDC browser login is not in scope for Readarr-compat clients; point them at `X-Api-Key`.

**Forward-auth (reverse-proxy SSO).** When forward-auth is configured in **Settings → Authentication**, bookkeeprr trusts identity headers (`Remote-User` / `Remote-Email` / `Remote-Groups` by default, configurable) on every request - but only when the request peer IP matches a configured CIDR allowlist. First contact creates a real session + sets the `bookkeeprr_session` cookie; subsequent requests in the same session reuse it via the normal cookie path. Forms login at `/login` remains a runtime fallback when forward-auth headers/peer aren't present (e.g., when bookkeeprr is accessed directly via the LAN instead of through the proxy).

Forward-auth is **not** in scope for `/api/readarr/v1/*` clients - they authenticate via `X-Api-Key` (or session cookie) rather than identity headers.

**Audit log.** bookkeeprr persists auth events (login/logout/role-recompute) and admin operations (settings PATCH/PUT, user management) to an `audit_events` table. The table is append-only by convention; housekeeping prunes events older than 30 days (configurable). The bundled UI exposes the events at `/settings/audit` for admins. Pino still emits its operational log lines as usual; they are also written to daily-rotated files under `<CONFIG_DIR>/logs/` for in-UI viewing at `/settings/logs`.

```bash
# Personal API key (Account → API keys) - the recommended client mode
curl -H 'Authorization: Bearer bkr_…' http://localhost:3000/api/series

# Static system key (Settings → API Access) - Readarr-compat clients
curl -H 'X-Api-Key: <key>' http://localhost:3000/api/readarr/v1/system/status

# Session cookie - what the bundled UI does; shown for completeness
curl -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"…"}'
curl -b /tmp/cookies.txt http://localhost:3000/api/series
```

If you're not deploying behind a reverse proxy that handles TLS, the cookie's `Secure` flag won't be set - fine on localhost; for any other deployment, **terminate TLS at a reverse proxy.** See [deploy.md → Hardening](./deploy.md#hardening).

**Content-Type.** Send `Content-Type: application/json` on all writes. Responses are always JSON.

**Status codes:**

| Code | Meaning                                                                              |
| ---- | ------------------------------------------------------------------------------------ |
| 200  | Success (read or update)                                                             |
| 201  | Created (series, downloads, jobs)                                                    |
| 202  | Accepted (long-running job enqueued)                                                 |
| 204  | No content (deletes)                                                                 |
| 400  | Bad request - invalid id, malformed body, Zod validation failure                     |
| 404  | Not found                                                                            |
| 409  | Conflict - UNIQUE constraint violated, already-grabbed, concurrent job in progress   |
| 422  | Foreign-key violation - referencing a row that doesn't exist (e.g. qualityProfileId) |
| 502  | Upstream service failure (qBT, AniList, MangaDex, ComicVine, ABS, Calibre)           |
| 503  | Required service not configured (qBT creds missing, ComicVine API key missing)       |

**Error envelope.** Most errors return `{"error": "human message"}`. A few routes also include `{"detail": "..."}` (the underlying error string) or `{"hint": "..."}` (recovery suggestion). The pattern is not yet uniform - see [Quirks & inconsistencies](#quirks--inconsistencies).

**Masked secrets.** Settings endpoints that hold credentials never return the stored secret. The exact idiom varies per family (the code is the source of truth; the generated OpenAPI spec carries the per-field semantics in each field's description):

- **`"****"` family** - qBT password, ComicVine / Google Books / NYT API keys, MAL Client ID, Prowlarr API key: GET returns `"****"` when a value is stored, `""` when unset. On PUT, **empty string means "leave unchanged"** (MAL/NYT/Prowlarr also accept the literal `"****"` as "leave unchanged"). There is **no null-clear** on this family - these schemas reject `null`; once set, a secret can only be replaced.
- **`"••••••••"` family** - Discord/Apprise webhook URLs, Audiobookshelf API token, Calibre password: GET returns `"••••••••"` when configured, `null` when not. On PATCH, **empty string means "leave unchanged"** and **`null` means "clear"**. For Audiobookshelf/Calibre the `""`-means-keep idiom also applies to the non-secret nullable fields (`baseUrl`, `libraryId`, `username`).
- **Indexer secrets** (Torznab `apiKey`, MAM `mamId` inside `configJson`, private-tracker `passkey`) mask to `""` on GET; `""` on PATCH keeps the stored value.
- **Exception:** `GET /api/settings/api-key` returns the static API key in **plaintext** when enabled (the admin UI shows it for copy/paste).

---

## Quick reference

| Resource family      | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Series**           | `GET /api/series` · `POST /api/series` · `GET /api/series/[id]` · `PATCH /api/series/[id]` · `DELETE /api/series/[id]` · `GET /api/series/search` · `POST /api/series/search` · `GET /api/series/[id]/releases` · `POST /api/series/[id]/manual-grab`                                                                                                                                                                                             |
| **Search**           | `POST /api/search/interactive` · `POST /api/search/interactive/grab`                                                                                                                                                                                                                                                                                                                                                                              |
| **Releases**         | `POST /api/releases/[id]/grab`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Downloads**        | `GET /api/downloads` · `DELETE /api/downloads/[hash]` · `POST /api/downloads/[hash]/pause` · `POST /api/downloads/[hash]/resume` · `POST /api/downloads/pause-all` · `DELETE /api/downloads/history`                                                                                                                                                                                                                                              |
| **Indexers**         | `GET /api/indexers` · `POST /api/indexers` · `PATCH /api/indexers/[id]` · `DELETE /api/indexers/[id]` · `POST /api/indexers/prowlarr/sync` · `POST /api/indexers/prowlarr/test` · `POST /api/indexers/torznab/caps`                                                                                                                                                                                                                               |
| **Quality profiles** | `GET /api/quality-profiles` · `POST /api/quality-profiles/[id]/default`                                                                                                                                                                                                                                                                                                                                                                           |
| **Calendar**         | `GET /api/calendar`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Library**          | `GET /api/library/summary` · `POST /api/library/health-scan` · `GET\|POST /api/library/rename-all` · `GET\|POST /api/library/groups` · `PATCH\|DELETE /api/library/groups/[id]` · `POST /api/library/import/scan` · `POST /api/library/import`                                                                                                                                                                                                                                                                                                                                            |
| **Library files**    | `POST /api/library-files/[id]/reroute`                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Book series**      | `GET /api/book-series` · `POST /api/book-series` · `GET /api/book-series/{id}` · `PATCH /api/book-series/{id}` · `DELETE /api/book-series/{id}` · `POST /api/book-series/{id}/members` · `DELETE /api/book-series/{id}/members/{seriesId}` · `POST /api/book-series/{id}/refresh`                                                                                                                                                                |
| **Jobs**             | `GET /api/jobs/[id]` · `POST /api/jobs/run`                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Scan**             | `POST /api/scan` · `GET /api/scan/groups` · `POST /api/scan/groups/[dirHash]/match` · `POST /api/scan/groups/[dirHash]/confirm` · `POST /api/scan/groups/[dirHash]/reject`                                                                                                                                                                                                                                                                        |
| **Settings**         | `GET\|PUT /api/settings/qbt` · `GET\|PUT /api/settings/naming` · `GET\|PUT /api/settings/comicvine` · `GET\|PUT /api/settings/googlebooks` · `GET\|PUT /api/settings/mal` + `POST .../mal/test` · `GET\|PUT /api/settings/nyt` + `POST .../nyt/test` · `GET\|PUT /api/settings/prowlarr` · `GET\|PUT /api/settings/flaresolverr` + `POST .../flaresolverr/test` · `GET\|PUT /api/settings/discover` · `GET\|PUT /api/settings/search-providers` · `GET\|PUT /api/settings/storage` · `GET\|PATCH /api/settings/notifications` · `POST /api/settings/notifications/test` · `GET\|PATCH /api/settings/library-sync/audiobookshelf` · `POST .../audiobookshelf/test` · `GET .../audiobookshelf/libraries` · `GET\|PATCH /api/settings/library-sync/calibre` · `POST .../calibre/test` · `GET\|PATCH /api/settings/api-key` + `POST .../api-key/test` · `GET\|PATCH /api/settings/auto-grab` · `GET /api/settings/housekeeping` + `PATCH .../housekeeping/{jobs,backups,releases,visibility}` · `PATCH /api/settings/updates` · `GET /api/settings/matcher` + `PATCH .../matcher/{weights,adult-filter,auto-replay}` |
| **Connection tests** | `POST /api/qbt/test-connection` · `POST /api/comicvine/test-connection`                                                                                                                                                                                                                                                                                                                                                                           |
| **Health & wizard**  | `GET /api/health` · `GET /api/first-run/status` · `POST /api/first-run/complete`                                                                                                                                                                                                                                                                                                                                                                  |
| **Auth**             | `POST /api/auth/register-first-admin` · `POST /api/auth/login` (+ `login/totp`) · `POST /api/auth/logout` (+ `logout/all`) · `GET\|DELETE /api/auth/me` (+ `me/profile`, `me/notifications`, `me/api-keys`, `me/totp*`) · `POST /api/auth/change-password` · `GET /api/auth/sessions` (+ `DELETE [tokenPrefix]`)                                                                                                                                  |
| **Users**            | `GET /api/users` · `POST /api/users` · `PATCH /api/users/[id]` · `DELETE /api/users/[id]` · `POST /api/users/[id]/reset-password`                                                                                                                                                                                                                                                                                                                 |

### Auth endpoints

| Method     | Path                                          | Purpose                                                                                                                                                                         |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST       | `/api/auth/register-first-admin`              | Create the first admin (allowed only when no users exist). Body `{email, password}` - the email doubles as the username. **201** `{user}` + session cookie.                     |
| POST       | `/api/auth/login`                             | `{username, password}` → set session cookie. When the account has 2FA, returns `{requiresTotp: true, challengeToken}` instead (no cookie yet).                                  |
| POST       | `/api/auth/login/totp`                        | `{challengeToken, code}` - 6-digit TOTP or `xxxx-xxxx-xxxx` recovery code (consumed) → session cookie.                                                                          |
| POST       | `/api/auth/logout`                            | Revoke current session + clear cookie. Always **204**.                                                                                                                          |
| POST       | `/api/auth/logout/all`                        | Revoke EVERY session of the current user (incl. this one). **200** `{ok: true}`.                                                                                                |
| GET        | `/api/auth/me`                                | Returns `{user}` (or `{user: null}` - HTTP 200 - if unauthenticated). `totpEnabledAt` is epoch **ms**.                                                                          |
| DELETE     | `/api/auth/me`                                | Self-service account deletion. Body `{currentPassword}`; local accounts only.                                                                                                   |
| PATCH      | `/api/auth/me/profile`                        | Update `{displayName?, email?}`; `""` clears a field.                                                                                                                           |
| GET/PATCH  | `/api/auth/me/notifications`                  | Per-user notification prefs `{prefs}`. PATCH is a strict partial merge.                                                                                                         |
| GET/POST   | `/api/auth/me/api-keys`                       | Personal API keys. POST `{name}` → **201** with the full `bkr_…` key in `plaintext` (shown once); use as `Authorization: Bearer bkr_…`.                                         |
| DELETE     | `/api/auth/me/api-keys/[id]`                  | Revoke a personal API key.                                                                                                                                                      |
| POST       | `/api/auth/me/totp/setup`                     | Start 2FA setup: `{secret, otpauthUri, qrCodeDataUrl, recoveryCodes}` - nothing persisted until `/enable`.                                                                      |
| POST       | `/api/auth/me/totp/enable`                    | Enable 2FA: echo `{secret, code, recoveryCodes}` back. 422 on a bad code.                                                                                                       |
| DELETE     | `/api/auth/me/totp`                           | Disable 2FA. Body `{password}`.                                                                                                                                                 |
| POST       | `/api/auth/me/totp/recovery-codes/regenerate` | Body `{password}` → `{recoveryCodes}` (10 fresh codes, shown once).                                                                                                             |
| POST       | `/api/auth/change-password`                   | Voluntary (`{currentPassword, newPassword}`) or forced (`{newPassword}` while `mustChangePassword`) change. Revokes all sessions; reissues a fresh cookie.                      |
| GET        | `/api/auth/sessions`                          | List my sessions; `id` is the first 12 chars of each token.                                                                                                                     |
| DELETE     | `/api/auth/sessions/[tokenPrefix]`            | Revoke another session by token prefix. 400 for the current session (use logout); 409 when the prefix is ambiguous.                                                             |

Auth-mode reality: the gate exempts all of `/api/auth/*`; each handler self-gates. `me`, `me/profile`, `me/notifications`, `change-password`, `sessions`, `logout/all` read the session **cookie** directly (bearer/X-Api-Key won't work); `me/api-keys` and `me/totp*` accept any user credential but reject the X-Api-Key "system" actor. Errors across this family use the `{ "message": "..." }` envelope.

### User-management endpoints (admin-only)

| Method | Path                             | Purpose                                                              |
| ------ | -------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/users`                     | List users (no `passwordHash` in response).                          |
| POST   | `/api/users`                     | Create a user (admin sets initial password + force-change flag).     |
| PATCH  | `/api/users/[id]`                | Update `role` or `disabled`. Last-admin guard blocks unsafe changes. |
| DELETE | `/api/users/[id]`                | Delete a user. Last-admin + self-delete guards. Cascades sessions.   |
| POST   | `/api/users/[id]/reset-password` | Admin resets a user's password + forces change. Revokes sessions.    |

### Auth (OIDC) endpoints

| Method | Path                      | Purpose                                                             |
| ------ | ------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/auth/oidc/info`     | Public; returns `{enabled, buttonLabel}` so `/login` can render.    |
| POST   | `/api/auth/oidc/start`    | Begins the auth-code flow; sets pending cookie; 302 to the IdP.     |
| GET    | `/api/auth/oidc/callback` | Receives the IdP redirect; exchanges code; sets session cookie.     |
| GET    | `/api/auth/oidc/config`   | Admin-only; returns masked config (`clientSecret = '••••••••'`).    |
| PATCH  | `/api/auth/oidc/config`   | Admin-only; merge-update. Empty-string secret keeps; `null` clears. |
| POST   | `/api/auth/oidc/test`     | Admin-only; tests discovery + returns resolved endpoints.           |

### Auth (Forward-auth) endpoints

| Method | Path                              | Purpose                                                                                                                                                                        |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/auth/forward-auth/validate` | Admin-only; given a candidate `trustedProxies` + `userHeader`, returns whether the current request would pass forward-auth's checks (used by the settings UI before enabling). |
| GET    | `/api/auth/forward-auth/config`   | Admin-only; returns the current forward-auth config.                                                                                                                           |
| PATCH  | `/api/auth/forward-auth/config`   | Admin-only; merge-update. When `enabled` transitions `false → true`, server re-runs the validate check and returns 422 with a diagnostic if it fails.                          |

### Audit endpoints

| Method | Path                           | Purpose                                                                               |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| GET    | `/api/audit/events`            | Admin-only; paginated audit-event query with filters (action, actorUserId, from, to). |
| GET    | `/api/audit/logs/files`        | Admin-only; lists daily-rotated log files (name, sizeBytes, mtime).                   |
| GET    | `/api/audit/logs/files/[name]` | Admin-only; paginated tail of a log file (path-traversal guarded).                    |

---

## Series

bookkeeprr models media as a series with N volumes and M chapters. The five content types each have a tailored creation shape but share the read/update/delete surface.

### `GET /api/series`

List series with pagination.

**Query:** `page` (int ≥ 1, default `1`) · `limit` (int ≤ 100, default `20`) · `sort` (`added_at:desc` | `added_at:asc` | `title:asc`, default `added_at:desc`) · `q` (optional title filter, case-insensitive substring match on the English title)

Each row is the series record plus enrichment: `title` (first non-null of english/romaji/native), `monitored` (bool), `volumes` / `downloaded` (counts), `readState` (`unread` | `reading` | `finished`, per current user), `health` (`complete` | `missing` | `downloading` | `error`), and the library-group fields `groupId` (int | null) / `groupPath` (display path, ancestor names joined with `" / "` - e.g. `"Engineering / Architecture"`; `""` when ungrouped).

**200:**

```json
{
  "rows": [
    /* SeriesRow */
  ],
  "total": 412,
  "page": 1,
  "limit": 20
}
```

### `POST /api/series`

Create a series. The request body is a discriminated union on `contentType`; each arm has its own required fields. Common fields across all arms: `qualityProfileId`, `rootPath`, `monitoring` (`all` | `missing` | `future` | `none`, default `all`), and an optional `groupId` to file the new series under a [library group](#library-groups) (**422** when the group doesn't exist).

| `contentType`  | Required identifier           | Required title fields                 | Notes                                                                 |
| -------------- | ----------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `manga`        | `anilistId`                   | one of `titleEnglish` / `titleRomaji` | Enqueues `metadata_hydrate` + `mangadex_chapter_sync` if `mangadexId` |
| `comic`        | `comicvineId`                 | `titleEnglish`                        | Enqueues `comicvine_hydrate`                                          |
| `light_novel`  | `anilistId`                   | `titleEnglish`                        | Optional `author`. Hydrate via `metadata_hydrate`                     |
| `ebook` single | `olid` (OpenLibrary work key) | `title`                               | `flow: "single"` - creates a 1-volume series                          |
| `ebook` series | `olid`                        | `title`                               | `flow: "series"` - `totalVolumes` (1-200) required                    |
| `audiobook`    | `asin`                        | `title`                               | Optional `narrator`, `runtimeMinutes`                                 |

**Example (manga):**

```bash
curl -X POST http://localhost:3000/api/series \
  -H 'Content-Type: application/json' \
  -d '{
    "contentType": "manga",
    "anilistId": 105778,
    "titleEnglish": "Chainsaw Man",
    "titleRomaji": "Chainsaw Man",
    "coverUrl": "https://...",
    "status": "releasing",
    "rootPath": "/media/comics/Chainsaw Man",
    "qualityProfileId": 1,
    "monitoring": "all",
    "granularity": "chapter"
  }'
```

**201:** the full series object (including `groupId` / `groupPath`) - except the `light_novel` branch, which returns just `{ "id": 7 }` (see [Quirks](#quirks--inconsistencies)). **409** if `(contentType, anilistId|comicvineId|olid|asin|isbn)` already exists. **422** if `qualityProfileId` or `groupId` doesn't resolve.

### `GET /api/series/[id]`

Fetch one series.

**200:** full series object plus enrichment (`title`, `monitored`, `volumes`, `downloaded`, `volumesList`, `groupId` / `groupPath`). Also includes `hydrating: boolean` - `true` while any background job (metadata/volume hydrate, chapter sync, import) is still active for this series. Clients should poll at ~4 s until `hydrating` flips false to pick up freshly-enriched covers/volumes. **400** invalid id. **404** not found.

### `PATCH /api/series/[id]`

Partial update. Body is strict (extra fields rejected). Updatable: `titleEnglish`, `titleRomaji`, `titleNative`, `mangadexId`, `status`, `coverUrl`, `description`, `totalVolumes`, `totalChapters`, `rootPath`, `monitoring`, `granularity`, `qualityProfileId`, `extraSearchTermsJson`, `groupId`.

`groupId` moves the series into a [library group](#library-groups) (`null` ungroups it). The move is validated before any other field is applied - **422** when the group doesn't exist, and nothing is written. **200:** the updated series row including `groupId` / `groupPath`.

### `DELETE /api/series/[id]`

Permanent. Cascades to volumes, chapters, releases, downloads, library_files rows. Files on disk are **not** touched.

**204** on success. **400** invalid id.

### `GET /api/series/search`

Federated metadata search.

**Query:** `q` (required) · `contentType` (`manga` | `comic` | `light_novel` | `ebook` | `audiobook`, default `manga`)

**200:** shape depends on type. Manga returns `{ contentType, hits: [...] }`. Comic/LN/ebook/audiobook return `{ contentType, results: [...] }`. The per-type element shape mirrors each provider's hit row (AniList, ComicVine, OpenLibrary, Audnex).

**502** upstream provider failure. **503** ComicVine not configured (only on `contentType=comic`).

### `POST /api/series/search`

Legacy body-based form of the manga search (AniList with MangaDex completion fallback). Prefer `GET /api/series/search?contentType=manga`.

**Body:** `{ "query": "chainsaw man" }`

**200:** `{ "hits": [...] }` (AniList hit rows, no `contentType` discriminator). **400** empty/missing query. **502** upstream failure.

### `GET /api/series/[id]/releases`

List candidate releases for a series, annotated with ownership.

**200:**

```json
{
  "releases": [
    {
      "id": 42,
      "title": "[Group] Chainsaw Man v01 (2019) (Digital)",
      "indexerGuid": "nyaa-1234567",
      "seeders": 12,
      "leechers": 1,
      "sizeBytes": 134217728,
      "score": 87,
      "ownership": "none"
    }
  ]
}
```

`ownership` is `"none" | "downloading" | "in-library"`. Capped at 200 most-recent rows.

### `POST /api/series/[id]/manual-grab`

Grab a user-supplied magnet link or `.torrent` file for this series, bypassing the indexers. The download flows through the normal pipeline (qBittorrent → import → library).

**Body:** either JSON `{ "magnet": "magnet:?xt=urn:btih:..." }`, or `multipart/form-data` with a `torrent` file field (max 2 MiB).

**201:**

```json
{
  "releaseId": 42,
  "downloadId": 7,
  "qbtHash": "abcdef0123456789abcdef0123456789abcdef01",
  "status": "queued"
}
```

**400** invalid magnet / malformed torrent / missing field. **404** series not found. **409** the torrent is already active or imported. **502** qBittorrent add failed. **503** qBittorrent not configured.

---

## Search

### `POST /api/search/interactive`

Run interactive indexer search for a series (forces a fresh poll, doesn't use cached releases).

**Body:** `{ "seriesId": 1, "queryOverride": "optional alternate query" }`

**200:**

```json
{
  "results": [
    {
      "item":        { "guid": "...", "title": "...", "link": "magnet:...", "seeders": 5, "leechers": 0, "sizeBytes": 1234567, "publishedAt": "2026-04-12T08:00:00Z", "indexerId": 1, "indexerName": "Nyaa.si", "indexerKind": "nyaa", "infoUrl": "https://nyaa.si/view/...", "freeleech": true, "vip": false },
      "parsed":      { "cleanTitle": "test series", "targetKind": "volume", "targetLow": 1, "targetHigh": 1, "group": "Group", "language": "en", "isBatch": false, "confidence": 0.9, "contentTypeHint": null, "debug": { "matched": "v01", "stripped": "..." } },
      "matchResult": { "matches": true, "score": 87 },
      "ownership":   "none",
      "releaseId":   42
    }
  ],
  "errors": [{ "indexerId": 2, "message": "indexer: 401 invalid auth" }]
}
```

`matchResult` is `{ "matches": true, "score": n }` or `{ "matches": false, "reason": "title-mismatch" | "granularity-mismatch" | "content-type-mismatch" | "language" | "size" | "adult-filter" | "rejected" }`. `ownership` is `none` | `in-library` | `downloading`. `releaseId` is set only for matching results. `item.freeleech` and `item.vip` are optional booleans emitted by indexers that surface those flags (e.g. MAM).

Results sorted matches-first (by score), then by seeders. Matching releases are upserted into the `releases` table as a side-effect (so subsequent grabs work). **502** only when every indexer fails and there are zero results.

### `POST /api/search/interactive/grab`

Force-grab a result straight from an interactive search - including a non-matching result, which has no release row yet. Pass the `item` and `parsed` objects back verbatim from the search response; the route upserts the release row, then sends it to qBittorrent.

**Body:** `{ "seriesId": 1, "item": { "guid", "title", "link", "seeders", "leechers", "sizeBytes", "publishedAt", "indexerId" }, "parsed": { "targetKind", "targetLow", "targetHigh", "group", "language", "isBatch" }, "score": null }`

**201:** `{ "downloadId": 99, "qbtHash": "abc...", "status": "queued" }`

**Errors:** same mapping as `POST /api/releases/[id]/grab` below (400 / 404 / 409 / 502 / 503).

---

## Releases & downloads

### `POST /api/releases/[id]/grab`

Send a release to qBittorrent.

**201:** `{ "downloadId": 99, "qbtHash": "abc...", "status": "queued" }`

**Errors:**

- **400** malformed magnet/link.
- **404** release or its series no longer exists.
- **409** release already has a download row.
- **502** qBittorrent rejected the add, or the hash never appeared in the qBT category after a 10×500ms poll.
- **503** qBT not configured.

### `GET /api/downloads`

Activity feed.

**200:**

```json
{
  "downloads": [
    {
      "id": 99,
      "qbtHash": "abc...",
      "status": "downloading",
      "addedAt": "2026-05-24T14:00:00Z",
      "completedAt": null,
      "importedAt": null,
      "error": null,
      "progress": 0.42,
      "downloadSpeed": 1048576,
      "eta": 120,
      "seeds": 8,
      "sizeBytes": 734003200,
      "release": { "id": 42, "title": "...", "indexerGuid": "...", "indexerName": "Nyaa.si", "indexerKind": "nyaa" },
      "series": { "id": 1, "title": "Chainsaw Man", "coverUrl": "/api/img?u=...", "contentType": "manga" }
    }
  ]
}
```

Capped at 200 most-recent. Status enum: `queued` | `downloading` | `importing` | `completed` | `imported` | `failed` | `superseded`. `progress` / `downloadSpeed` / `eta` / `seeds` / `sizeBytes` are live qBittorrent transfer stats, merged best-effort for active rows - all `null` when the torrent isn't active or qBittorrent is unconfigured/unreachable. Manual grabs and qbt-adopted torrents carry the sentinel indexer (`indexerKind: "manual"`). External CDN covers are rewritten through the caching `/api/img` proxy. The `series` object includes `contentType` (`manga` | `comic` | `light_novel` | `ebook` | `audiobook`) so clients can pick a content-type-matched placeholder when the cover is absent.

### Download control (admin only)

These five endpoints require an **admin** session/token (401 = not signed in, 403 = signed in but not admin) and return errors as `{ "message": "..." }` rather than the shared `{ "error": ... }` envelope - see [Quirks](#quirks--inconsistencies).

#### `POST /api/downloads/[hash]/pause` · `POST /api/downloads/[hash]/resume`

Pause/resume the torrent in qBittorrent by hash. **200:** `{ "ok": true }`. **502** when qBittorrent is not configured or the call fails.

#### `POST /api/downloads/pause-all`

Pause every torrent across the per-content-type `bookkeeprr-*` qBittorrent categories. **200:** `{ "ok": true }`. **502** when qBittorrent is not configured or the call fails.

#### `DELETE /api/downloads/[hash]`

Cancel a download: removes the torrent (with files) from qBittorrent **and** deletes the download row so it leaves the activity feed. Both steps are best-effort and idempotent - a failed qBittorrent delete still clears the row. **200:** `{ "ok": true }`.

#### `DELETE /api/downloads/history`

Clear history: deletes all terminal download rows (`completed` / `imported` / `failed`); active rows are kept. **200:** `{ "ok": true, "deleted": 3 }`.

---

## Indexers

Admin-only family - 401/403 responses use the `{ "message": "..." }` envelope.

### `GET /api/indexers`

**200:**

```json
{
  "indexers": [
    {
      "id": 1,
      "kind": "nyaa",
      "name": "Nyaa.si",
      "baseUrl": "https://nyaa.si",
      "enabled": true,
      "configJson": "...",
      "lastRssAt": "2026-05-24T13:45:00Z",
      "lastSearchAt": null
    }
  ]
}
```

`configJson` is the per-kind config object as a JSON-encoded string; secrets within (torznab `apiKey`, mam `mamId`, private-tracker `passkey`) come back masked to `""`. The internal `manual` sentinel indexer (which holds hand-added torrents) is never listed.

### `POST /api/indexers`

Add an indexer. **Body:** `{ kind, name, baseUrl, enabled?, configJson }` where `kind` is one of `nyaa` / `torznab` / `mam` and `configJson` is the matching per-kind config object (see PATCH below for shapes; `pollIntervalSeconds` is **required** on create). `kind` must equal `configJson.kind` (mismatch → **400**); a body that fails schema validation returns **422** with `{ error, issues }`.

**201:** `{ "id": 3 }`.

### `PATCH /api/indexers/[id]`

Update indexer config. Body must match the existing row's `kind` (sending a `torznab` body to a `nyaa` row returns 400).

**Body (nyaa):**

```json
{
  "enabled": true,
  "configJson": {
    "kind": "nyaa",
    "queryTemplate": "{title}",
    "contentTypes": ["manga"],
    "categoryByContentType": { "manga": "3_3" }
  }
}
```


**Body (mam):**

```json
{
  "enabled": true,
  "configJson": {
    "kind": "mam",
    "queryTemplate": "{title}",
    "contentTypes": ["light_novel"],
    "categoryByContentType": { "light_novel": 14 },
    "proxyUrl": "",
    "searchIn": [],
    "mamId": ""
  }
}
```

`passkey: ""` leaves the existing passkey untouched (same for a torznab `apiKey: ""` and a mam `mamId: ""`). Send the real value to rotate it. `pollIntervalSeconds` is optional here - omitting it re-applies the default.

**200:** `{ "ok": true }`. **404** when the id doesn't exist.

### `DELETE /api/indexers/[id]`

Remove an indexer. **200:** `{ "ok": true }`. **400** on a non-numeric id; **404** when the id doesn't exist.

### `POST /api/indexers/prowlarr/sync`

Mirror every Prowlarr indexer as a managed torznab row (adds new ones, updates existing ones, disables rows that disappeared). **Body (optional):** `{ "url": "http://prowlarr:9696", "apiKey": "..." }` - when both are present the connection is persisted first; otherwise the stored connection is used.

**200:** `{ "added": 1, "updated": 0, "disabled": 0 }`. **502** when Prowlarr is unreachable or not configured.

### `POST /api/indexers/prowlarr/test`

Test the Prowlarr connection. **Body:** `{ "url": "...", "apiKey": "..." }` - blank/absent fields fall back to the stored connection (so a test works without re-entering the masked key); **400** when neither the body nor the store yields both.

**200:** `{ "ok": true }`. **502** when the connection test fails.

### `POST /api/indexers/torznab/caps`

Probe a Torznab endpoint's capabilities (`t=caps`). **Body:** `{ "url": "http://prowlarr/1/api", "apiKey": "...", "indexerId": 3 }` - send `apiKey: ""` plus `indexerId` to fall back to that row's stored key (the edit form masks it); **400** when no key is available.

**200:** `{ "categories": [{ "id": "7000", "name": "Books", "subcats": [{ "id": "7020", "name": "EBook" }] }] }`. **502** when the probe fails.

---

## Quality profiles

### `GET /api/quality-profiles`

Returns the array directly (not wrapped). Each row: `{ id, name, preferCompleteBatches, preferredGroupsJson, preferredLanguagesJson, minSizeMb, maxSizeMb, preferOriginals, isDefault }` - `preferredGroupsJson` / `preferredLanguagesJson` are JSON-encoded string arrays (e.g. `"[\"en\"]"`). Used by the series-add UI and the matcher.

### `POST /api/quality-profiles/[id]/default`

Admin only. Make profile `id` the single default: clears the flag on every other row and sets it on `id`, atomically. No request body.

**200:** the updated profile row. All error responses on this endpoint (**400** non-numeric id, **401/403**, **404** unknown id) use the `{ "message": "..." }` envelope.

---

## Calendar

### `GET /api/calendar`

Release calendar: every volume with a known release date inside the window.

**Query:** `from` · `to` - both `YYYY-MM-DD`, interpreted as UTC midnight. The window is `[from, to)` - **`to` is exclusive** and must be after `from`. **400** `{ "error": ... }` on a malformed date or an inverted/empty window.

**200:**

```json
{
  "entries": [
    {
      "date": "2026-06-15",
      "volumeId": 12,
      "volumeNumber": 3,
      "volumeTitle": "Vol. 3",
      "seriesId": 4,
      "seriesTitle": "Dandadan",
      "contentType": "manga",
      "coverUrl": "https://…",
      "author": "Yukinobu Tatsu",
      "publisher": null,
      "monitoring": "all"
    }
  ]
}
```

Entries are sorted by `date`, then `seriesTitle`, then `volumeNumber`. `seriesTitle` is the first non-null of english/romaji/native; `coverUrl` is the series cover (not per-volume).

---

## Library

### `GET /api/library/summary`

Aggregate series counts. **Bearer-only**: requires a mobile API token (`Authorization: Bearer …`); session cookies are not accepted on this endpoint.

**200:** `{ "total": 42, "monitored": 30, "missing": 3 }`. `monitored` counts series with `monitoring != "none"`; `missing` counts monitored series whose `totalVolumes` is set and whose imported volume-file count is below it (chapter-granularity series and series without `totalVolumes` count as not missing).

### `POST /api/library/health-scan`

Admin only. No body. Enqueues a background `library_health_scan` job that opens every library file with the reader probers and deletes / re-grabs corrupt or wrong-format content.

**202:** `{ "jobId": 7 }` - poll `GET /api/jobs/[id]`. **409** `{ "error": "...", "existingJobId": 5 }` when a health scan is already pending/running.

### `GET /api/library/rename-all`

Admin only. Dry-run preview: computes the rename plan for every series and returns only those with pending changes. Nothing is written to disk.

**200:** `{ "series": [{ "seriesId", "title", "folder": { "current", "proposed", "changed" }, "files": [{ "libraryFileId", "currentPath", "proposedPath" }] }], "seriesChanged": 1, "totalChanges": 3 }`.

### `POST /api/library/rename-all`

Admin only. No body. Enqueues a background `library_rename_all` job that re-applies the naming templates to every series on disk.

**202:** `{ "jobId": 7 }` - poll `GET /api/jobs/[id]`.

### Library groups

User-defined nested folders for organising series. A series belongs to at most one group (`series.groupId`); groups nest arbitrarily deep. Sibling names must be unique (per parent, including at the root).

| Method   | Endpoint                   | Purpose                                          |
| -------- | -------------------------- | ------------------------------------------------ |
| `GET`    | `/api/library/groups`      | List all groups with paths + counts              |
| `POST`   | `/api/library/groups`      | Create a group (admin only)                      |
| `PATCH`  | `/api/library/groups/[id]` | Rename and/or reparent (admin only)              |
| `DELETE` | `/api/library/groups/[id]` | **Recursive cascade delete** (admin only)        |

#### `GET /api/library/groups`

**200:** `{ "groups": [{ "id", "name", "parentId", "path", "seriesCount", "subgroupCount" }] }`. `path` is the display path - ancestor names joined with `" / "`, e.g. `"Engineering / Architecture"`. `seriesCount` is **recursive** (members of subgroups count into the ancestor); `subgroupCount` counts direct children only.

#### `POST /api/library/groups`

Admin only. **Body:** `{ "name": "Architecture", "parentId": 3 }` - `name` 1-40 chars (trimmed); omit `parentId` for a root group.

**201:** the full group row (same shape as a `GET` entry, with `path` and counts). **409** when a sibling with the same name already exists; **422** when `parentId` does not exist.

#### `PATCH /api/library/groups/[id]`

Admin only. **Body:** `{ "name": "..." }` and/or `{ "parentId": 3 }` - at least one required. `"parentId": null` moves the group to the root.

**200:** the updated row. **409** sibling-name conflict in the (new) location; **422** when the reparent would create a cycle or the group/parent does not exist.

#### `DELETE /api/library/groups/[id]`

Admin only. ⚠️ **Recursive cascade**: deletes the group, every subgroup beneath it, **and every member series record**. Each series goes through the regular series-delete path, so its volumes, files, and download records cascade exactly like a manual series delete. **Disk files are untouched** - only database records are removed.

**200:** `{ "deletedGroups": 2, "deletedSeries": 5 }`. **422** on an unknown id.

Errors on this family: 401/403 use the `{ "message": "..." }` envelope; 400/409/422 use the standard `{ "error": "..." }` envelope.

### Library import

Two-step import pipeline for adopting files that already exist on disk but are not yet tracked in the library.

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| `POST` | `/api/library/import/scan` | Scan roots for untracked files + suggest metadata (admin only) |
| `POST` | `/api/library/import` | Adopt confirmed rows into the library (admin only) |

#### `POST /api/library/import/scan`

Admin only. No body. Scans every configured library root for files not already tracked as `library_file` rows, queries OpenLibrary and Google Books for each found item (parallelized, cap 8), and returns the results. Provider failures are swallowed silently - an item whose lookup fails gets `best: null` and `alternatives: []`.

**200:** `{ "items": [{ "path", "detectedTitle", "contentType", "files", "sizeBytes", "best": { "sourceId", "title", "author", "year", "isbn", "coverUrl", "source" } | null, "alternatives": [...] }] }`.

#### `POST /api/library/import`

Admin only. **Body:** `{ "rows": [{ "item": ScanItem, "match": Candidate, "monitor": true, "qualityProfileId": 1 }] }`. For each row: finds or creates the series record (by provider id, then by `title+contentType`), ensures volume 1 exists, and inserts a `library_file` row for each untracked file. Fully idempotent - re-running the same rows creates 0 new rows. Rows whose content type is unsupported for direct import (e.g. manga/comic) or that fail for any reason are skipped rather than aborting the batch - they appear in `skipped`.

**200:** `{ "imported": 1, "seriesIds": [42], "skipped": [] }`. `imported` is the number of new `library_file` rows created; `seriesIds` is the deduplicated list of series ids touched; `skipped` is an array of `{ "path": string, "reason": string }` for each row that could not be adopted.

Errors: 401/403 use the `{ "message": "..." }` envelope; 400 on an invalid body uses the standard `{ "error": "..." }` envelope.

---

## Library files

### `POST /api/library-files/[id]/reroute`

Re-route an existing file to a different series and volume or chapter. Renames the file on disk using the current naming template.

**Body:** `{ "seriesId": 1, "volumeNumber": 2 }` OR `{ "seriesId": 1, "chapterNumber": "12.5" }` - exactly one of `volumeNumber` / `chapterNumber`.

**200:** `{ "oldPath": "...", "newPath": "...", "libraryFileId": 7 }`. **409** if the destination filename already exists.

---

## Book series

Book series are ebook/audiobook-only Seerr-style collections that group library series (titles) into a named franchise or sequence. They are distinct from library groups, which are organisational folders for any content type.

**Content types.** Only `ebook` and `audiobook` are valid for book series. `manga`, `comic`, and `light_novel` are not supported.

**Sources.** Manually created series have `source: "manual"`. Future tasks will add `openlibrary`, `itunes`, `audible`, and `googlebooks` as provider-backed sources.

Admin-only writes - 401/403 responses use the `{ "message": "..." }` envelope.

### `GET /api/book-series`

List all book series. Optionally filter by `?contentType=ebook` or `?contentType=audiobook`. Returns 400 when `contentType` is not a valid book-series content type.

**200:**

```json
{
  "bookSeries": [
    {
      "id": 1,
      "name": "His Dark Materials",
      "contentType": "ebook",
      "coverUrl": null,
      "totalBooks": null,
      "memberCount": 3,
      "source": "manual"
    }
  ]
}
```

### `POST /api/book-series`

Admin only. Create a book series manually.

**Body:** `{ "name": "His Dark Materials", "contentType": "ebook" }`. Optional: `description` (string | null), `coverUrl` (valid URL | null).

**201:** The created series summary (same shape as a list entry, `memberCount` always `0` at creation).

### `GET /api/book-series/{id}`

Return full detail for a book series, including the merged `books` list.

The `books` array merges owned library members with unmatched saga entries. Entries matched by `externalRef` (isbn/asin) or title+position are marked `owned: true` with their `seriesId`; unmatched entries have `owned: false, seriesId: null`. Members that have no matching saga entry are appended as owned orphans. The list is sorted by position (nulls last).

**200:**

```json
{
  "id": 1,
  "name": "His Dark Materials",
  "contentType": "ebook",
  "coverUrl": null,
  "totalBooks": 3,
  "memberCount": 2,
  "source": "manual",
  "description": null,
  "books": [
    { "position": 1, "title": "Northern Lights", "externalRef": "111", "coverUrl": null, "owned": true, "seriesId": 42 },
    { "position": 2, "title": "The Subtle Knife", "externalRef": "222", "coverUrl": null, "owned": false, "seriesId": null }
  ]
}
```

**404** when the book series does not exist.

### `PATCH /api/book-series/{id}`

Admin only. Update `name`, `description`, and/or `coverUrl`. At least one field is required (empty body returns 400). 401/403 use the `{ "message": "..." }` envelope.

**Body:** any subset of `{ "name": "...", "description": "...", "coverUrl": "..." }`.

**200:** The updated series summary (same shape as a list entry).

**404** when the book series does not exist.

### `DELETE /api/book-series/{id}`

Admin only. Remove the book series, its member links, and its saga entries. The linked library series themselves are not deleted. 401/403 use the `{ "message": "..." }` envelope.

**200:** `{ "ok": true }`.

**404** when the book series does not exist.

### `POST /api/book-series/{id}/members`

Admin only. Assign (link) a library series to this book series. Idempotent upsert: re-assigning a series that is already a member updates its position and preserves the `manual` linkSource - a repeat call never returns 409. Returns the refreshed detail on success.

**Body:** `{ "seriesId": 42, "position": 1 }`. `position` is optional (null when omitted).

**200:** Refreshed book series detail (same shape as `GET /api/book-series/{id}`).

**422** when the library series does not exist, or its content type does not match the book series. 401/403 use the `{ "message": "..." }` envelope.

### `DELETE /api/book-series/{id}/members/{seriesId}`

Admin only. Unassign (unlink) a library series from this book series. Idempotent: deleting a series that is not a member is a no-op and returns 200.

**200:** `{ "ok": true }`. 401/403 use the `{ "message": "..." }` envelope.

### `POST /api/book-series/{id}/refresh`

Admin only. Trigger a detection refresh for a book series. Returns 202 immediately.

**Note:** This is a scaffold - detection job wiring lands in a later task. The endpoint accepts and acknowledges the request without enqueuing yet.

**202:** `{ "ok": true }`. 401/403 use the `{ "message": "..." }` envelope.

---

## Jobs

### `GET /api/jobs/[id]`

Poll a background job's status.

**200:** the job row as stored: `{ id, kind, status, scheduledFor, startedAt, finishedAt, payloadJson, resultJson, error, attempt }`. `payloadJson` / `resultJson` are JSON-encoded strings; timestamps are ISO strings. Status enum: `pending` | `running` | `completed` | `failed` | `interrupted` | `cancelled`. Job `kind` is a slug such as `metadata_hydrate`, `mangadex_chapter_sync`, `library_scan`, `indexer_poll`, `missing_search`, `qbt_watch`, `import`, `housekeeping`, `comicvine_hydrate`, `library_health_scan`, `library_rename_all`.

Typical durations: `metadata_hydrate` < 5s; `library_scan` 1s-10min depending on tree size; `import` < 30s per release.

### `POST /api/jobs/run`

Admin only. Drain all pending jobs of a kind through the runner, now.

**Body:** `{ "kind": "qbt_watch" }` - one of `qbt_watch` | `import` | `library_scan` | `housekeeping`.

Self-enqueueable kinds (`qbt_watch`, `housekeeping`) get a fresh empty-payload job enqueued first, so this works as a "run it now" trigger; `import` / `library_scan` only drain what something else already enqueued.

**200:** `{ "ok": true, "kind": "qbt_watch", "ran": 1 }` - `ran` = jobs drained (`0` when idle).

---

## Scan

The scan workflow finds existing files on disk and matches them to series.

| Step | Endpoint                                  | Purpose                                                         |
| ---- | ----------------------------------------- | --------------------------------------------------------------- |
| 1    | `POST /api/scan`                          | Kick off a scan job for a directory.                            |
| 2    | `GET /api/jobs/[id]`                      | Poll until `status === "completed"`.                            |
| 3    | `GET /api/scan/groups`                    | List unconfirmed match groups (one per directory).              |
| 4    | `POST /api/scan/groups/[dirHash]/match`   | Attach an AniList match to the group (optional, manual fix-up). |
| 5    | `POST /api/scan/groups/[dirHash]/confirm` | Import the group into the library.                              |
| 5'   | `POST /api/scan/groups/[dirHash]/reject`  | Discard the group.                                              |

### `POST /api/scan`

**Body:** `{ "rootPath": "/media/comics", "targetGroupId": 3, "structure": "mirror" }` - `targetGroupId` and `structure` are optional.

`targetGroupId` + `structure` (`"flat"`, the default, or `"mirror"`) are **scan-session params**: they are stamped onto every pending scan match the job produces (a rescan refreshes them - the latest scan wins) and take effect at confirm time:

- **flat** - every series created by a confirm gets `groupId = targetGroupId` (omitted → the library root).
- **mirror** - the matched series directory's path relative to `rootPath`, minus the series folder itself, materializes as nested [library groups](#library-groups) under the target: confirming `<rootPath>/Shonen/Vinland Saga` creates group `Shonen` under the target and files the series inside it. Segments find-or-create idempotently, so sibling confirms reuse the same groups. A series folder directly at the scan root lands in the target group itself (no group created).

**Only newly created series are assigned.** A confirm that matches a pre-existing series never moves it - existing series keep their group.

**202:** `{ "jobId": 7 }`. **400** path not readable. **409** another scan is already running. **422** `targetGroupId` does not exist.

### `GET /api/scan/groups`

**200:** `{ "groups": [...] }`. Each group includes the directory, file count, proposed AniList ID & title, average parser confidence, per-file parsed metadata, and two scan-session fields: `relativeDir` - the series dir relative to the scan root (e.g. `"Shonen/Vinland Saga"`), the preview of what a mirror import will materialize (`""` for directories at the scan root and for rows that predate scan-session params) - and `structure` - the session's import structure (`"flat"` / `"mirror"`; `null` when the scan omitted it, which is the flat default, or the rows predate scan-session params).

### `POST /api/scan/groups/[dirHash]/match`

**Body:** `{ "anilistId": 105778 }`

**200:** `{ "ok": true, "updated": 12 }`. **502** AniList lookup failed.

### `POST /api/scan/groups/[dirHash]/confirm`

No body. Creates the series if not already in the library, inserts volumes/chapters, registers `library_files` rows. Transactional. A newly created series is filed into a library group per the scan session's `targetGroupId`/`structure` (see [`POST /api/scan`](#post-apiscan)); pre-existing matched series keep their group.

**200:** `{ "seriesId": 1, "importedCount": 12, "skippedCount": 0 }`. **400** if no match has been attached. **404** group already resolved.

### `POST /api/scan/groups/[dirHash]/reject`

No body. Marks the group rejected so it won't reappear in `GET /api/scan/groups`.

**200:** `{ "rejectedCount": 12 }`.

---

## Settings

All settings endpoints follow the same pattern: `GET` returns the current blob (with secrets masked - see [Masked secrets](#conventions)), `PUT`/`PATCH` updates it (with the empty-string-means-keep idiom for secrets). Test endpoints (`POST .../test`) fire a no-op probe against the third-party service without persisting. Reads are open to any authenticated user (except `storage`, `auto-grab`, `housekeeping`, and `matcher`, which are admin-only even on GET); **all writes are admin-only** and return their 401/403 as `{ "message": "..." }`.

### qBittorrent - `GET|PUT /api/settings/qbt`

**Body (PUT):** `{ "host": "127.0.0.1", "port": 8080, "username": "admin", "password": "...", "useHttps": false }` - `password: ""` keeps the stored password (no null-clear).

`POST /api/qbt/test-connection` with the same body (password optional - blank falls back to the stored one) returns `{ "ok": true }` on success or `{ "ok": false, "error": "..." }` on failure (with 502).

### Naming templates - `GET|PUT /api/settings/naming`

**Query:** `contentType` (one of the five).

**Body (PUT):** `{ "templates": { "series_folder": "{author}/{series_title}", "volume": "{series_title} - {volume:00}.{ext}", "chapter": "...", "batch": "..." } }`

Template syntax: see [use.md → Naming templates](./use.md#naming-templates). Validation errors include the template position that failed.

**`{group_path}` token** (library groups, `series_folder` only): expands to the series' library-group ancestry joined with `/` - e.g. `"Engineering/Architecture"` - and collapses to `""` when the series is ungrouped (a trailing slash is dropped automatically, so `{group_path}/{series_title}` renders as just `{series_title}` at the library root). Each group-name segment is path-sanitized individually. The token is **forbidden** in `volume`, `chapter`, and `batch` templates (it contains path separators; `validateTemplate` returns an error when it appears outside a folder template). Note the spelling: **`{group_path}`** (library folder) is distinct from **`{group}`** (release group / scan group, used in folder-templates for some indexers and rejected outside folder templates by the same mechanism); the two tokens are independent and not interchangeable.

All five content-type `series_folder` defaults include a `{group_path}/` prefix, so grouped series land in the correct subfolder automatically on the next rename pass.

### ComicVine - `GET|PUT /api/settings/comicvine`

**Body (PUT):** `{ "apiKey": "..." }` (`""` keeps the stored key). `POST /api/comicvine/test-connection` validates the key against ComicVine's `/api/issues/?limit=1` endpoint (blank/absent falls back to the stored key; 400 when neither yields one).

### Metadata-provider keys - `GET|PUT /api/settings/{googlebooks,mal,nyt}`

Same shape as ComicVine: `{ "apiKey": "..." }` (MAL uses `{ "clientId": "..." }`). GET masks to `"****"`; `""` (or the literal `"****"`) on PUT keeps the stored value. MAL and NYT also have admin-only probes - `POST /api/settings/mal/test` / `POST /api/settings/nyt/test` with an optional `clientId`/`apiKey` (omit to test the stored one) → `{ "ok": true }` or 502 `{ "ok": false, "error": "..." }`.

### Prowlarr connection - `GET|PUT /api/settings/prowlarr`

**Body (PUT):** `{ "url": "...", "apiKey": "..." }` - `""`/`"****"` keeps the stored key; `url` is always applied. (The sync/test actions live under [Indexers](#indexers): `POST /api/indexers/prowlarr/{sync,test}`.)

### FlareSolverr - `GET|PUT /api/settings/flaresolverr`

**Body (PUT):** `{ "url": "http://flaresolverr:8191" }` - not a secret, round-trips unmasked; `""` disables. `POST /api/settings/flaresolverr/test` (optional `url`, omit to test the stored one) solves a Cloudflare-protected probe page → `{ "ok": true }` or 502 `{ "ok": false, "error": "..." }`.

### Discover - `GET|PUT /api/settings/discover`

`{ "trendingSource": "anilist" | "mal" }`.

### Search providers - `GET|PUT /api/settings/search-providers`

A flat boolean map of the discovery search providers (`anilist`, `mal`, `mangadex`, `comicvine`, `openlibrary`, `audnex`, `novelupdates`). PUT is a strict full replace - every key required.

### Storage - `GET|PUT /api/settings/storage` (admin-only GET)

`{ "contentTypePaths": { "<contentType>": { "libraryRoot", "qbtCategory" } }, "torrentCleanup": { "mode", "ratio?", "seedMinutes?", "deleteFiles" }, "imageCache": { "enabled", "dir" } }`. `imageCache` is optional on PUT (older clients); schema failures return **422**.

### Notifications - `GET|PATCH /api/settings/notifications`

**Body (PATCH):** `{ "discordWebhookUrl": "...", "discordUsername": "bookkeeprr", "discordAvatarUrl": "...", "appriseUrl": "https://apprise.example/notify/...", "eventGrabSuccess": true, "eventImportSuccess": true, "eventFailure": true, "eventUpdateAvailable": true }`

GET masks the webhook URLs to `"••••••••"` (`null` when unset) and adds `discordWebhookConfigured` / `appriseConfigured` booleans.

`POST /api/settings/notifications/test` fires a synthetic event through every configured transport and returns per-transport status: `{ "discord": "ok", "apprise": "ok" }` or `{ "discord": "not-configured", "apprise": { "error": "..." } }`.

### Audiobookshelf - `GET|PATCH /api/settings/library-sync/audiobookshelf`

**Body (PATCH):** `{ "baseUrl": "https://abs.example", "apiToken": "...", "libraryId": "...", "contentTypes": ["audiobook"], "enabled": true }`

- `GET /api/settings/library-sync/audiobookshelf/libraries` → `{ "libraries": [{ "id": "...", "name": "...", "mediaType": "book" }] }` for populating the library-picker dropdown.
- `POST /api/settings/library-sync/audiobookshelf/test` → triggers a library scan and returns `{ "ok": true }` or 502.

### Calibre - `GET|PATCH /api/settings/library-sync/calibre`

**Body (PATCH):** `{ "baseUrl": "https://calibre.example:8080", "username": "...", "password": "...", "libraryId": "...", "contentTypes": ["ebook"], "enabled": true }`

`POST /api/settings/library-sync/calibre/test` triggers a refresh. Returns 502 with a typed error code (e.g. `unsupported-version`) if Calibre's content-server is older than v6.

### API key - `GET|PATCH /api/settings/api-key`

`GET` → `{ "enabled", "key", "createdAt" }` - the key comes back in **plaintext** when enabled (the admin UI shows it for copy/paste), `""` when disabled. `PATCH { "action": "generate" }` rotates and returns the new key; `{ "action": "disable" }` clears it. `POST /api/settings/api-key/test` validates the `X-Api-Key` header you send (no body): `{ "ok": true }` on match (plus a `note` when auth is disabled), 401 `{ "ok": false, "error": "key mismatch" }` otherwise. See [Authentication](#authentication) for how the key gates `/api/*`.

### Auto-grab - `GET|PATCH /api/settings/auto-grab` (admin-only GET)

`GET` returns the config blob bare (currently `{ "dryRun": false }`); `PATCH` is a strict partial merge returning `{ "config": { ... } }` (422 on schema failure).

### Housekeeping - `GET /api/settings/housekeeping` + four PATCH subroutes (admin-only)

`GET` returns all four retention blobs: `{ "jobs": { "terminalDays", "errorDays" }, "backups": { "daily", "monthlyDay1" }, "visibility": { "auditRetentionDays", "logRetentionDays" }, "releases": { "keepPerSeries", "olderThanDays" } }`. Each blob is written via its own strict-partial PATCH - `/api/settings/housekeeping/{jobs,backups,releases,visibility}` → `{ "config": { ... } }` (422 on schema failure).

### Updates - `PATCH /api/settings/updates`

Strict partial merge of `{ "frequency": "hourly"|"daily"|"weekly"|"off", "behavior": "notify"|"auto-download"|"auto-install", "notifyOnIntegrations", "showChangelogOnFirstLaunch" }` → `{ "config": { ... } }`. (The combined read lives at `GET /api/updates`.)

### Matcher - `GET /api/settings/matcher` + three PATCH subroutes (admin-only)

`GET` → `{ "weights": { scoring integers + minSeeders }, "adultFilter": { "enabled", "blockedCategories" } }`. The `weights` blob carries the scoring weights (`groupTopWeight`, `groupStepDown`, `batchBonus`, `seederMultiplier`, `trustedBonus`, `remakePenalty`) plus `minSeeders` - a hard pre-grab floor (default `1`): releases with fewer seeders are rejected with reason `insufficient-seeders` before grabbing, and `0` disables the filter. Strict-partial PATCHes at `/api/settings/matcher/{weights,adult-filter}` → `{ "config": { ... }, "autoReplayEnqueued?": { "runId" } | { "error" } }` (the extra field appears when "auto-replay on save" is on), and `/api/settings/matcher/auto-replay` `{ "enabled": bool }` → `{ "enabled": bool }`.

---

## Health & first-run

### `GET /api/health`

**200:** `{ "status": "healthy", "worker": { "heartbeatAgeMs": 12345 }, "timestamp": 1750000000000 }` while the worker heartbeat is fresh (≤ 3 minutes old). **503** with the **same body shape** (`status: "unhealthy"`, `heartbeatAgeMs: null` when no heartbeat was ever recorded) otherwise. `timestamp` is epoch ms.

### `GET /api/first-run/status`

**200:** `{ "complete": true|false }`. The Next.js middleware uses this to gate access to the wizard.

### `POST /api/first-run/complete`

Sets the first-run flag. Called by the wizard after the user finishes the setup steps. **200:** `{ "ok": true }`.

---

## Quirks & inconsistencies

These are real and intentional (or grandfathered) for now. Documented so integrators aren't surprised.

1. **Settings verbs split between PUT and PATCH.** qBT, naming, ComicVine, Google Books, MAL, NYT, Prowlarr, FlareSolverr, discover, search-providers, and storage use `PUT` (full replace). Notifications, library-sync, api-key, auto-grab, housekeeping, updates, and matcher use `PATCH` (merge). The empty-string-means-keep idiom makes them behave similarly in practice, but the verb is different.
2. **Success envelopes vary.** Resource endpoints (`GET/POST/PATCH /api/series`) return the full object. Most setting updates return `{ "ok": true }`, but the strict-partial-merge family (auto-grab, housekeeping, updates, matcher) returns `{ "config": { ... } }` and api-key returns the key blob. Scan confirm returns operation results `{ "seriesId, importedCount, skippedCount }`. Grab returns `{ "downloadId, qbtHash, status }`. No top-level `{ "data": ... }` wrapper.
3. **`GET /api/series/search`** uses `hits` for manga and `results` for comic/light_novel/ebook/audiobook. Will likely be unified to `results` in a future cleanup. The legacy `POST /api/series/search` returns `{ hits }` with no `contentType` discriminator.
4. **`GET /api/quality-profiles`** returns the array directly - not wrapped in `{ "profiles": [...] }`. This is the one read endpoint that doesn't follow the resource-family wrapping convention.
5. **No batch operations.** Bulk delete / bulk update is not exposed. The UI doesn't need it; if you do, hit endpoints in a loop.
6. **No pagination on `/api/downloads` or `/api/series/[id]/releases`** - both are capped at 200 most-recent rows.
7. **No `DELETE` endpoints for settings** - on the PATCH family (notifications, library-sync), clearing a field means PATCHing it to `null`, not deleting the resource. The PUT family's secrets (qBT password, ComicVine/Google Books/NYT keys, MAL Client ID, Prowlarr key) reject `null` and cannot be cleared via the API once set - only replaced.
8. **Path exposure in scan.** `GET /api/scan/groups` returns absolute filesystem paths from the host. If you proxy this UI to less-trusted users, scrub the response.
9. **`POST /api/series` response shape differs per branch.** The manga/comic/ebook/audiobook branches return the full created series row; the `light_novel` branch returns just `{ "id": 7 }`. Follow up with `GET /api/series/[id]` if you need the full row after an LN create.
10. **Admin download-control errors use `{ "message": ... }`.** The five admin-gated download endpoints (`pause` / `resume` / `pause-all` / `DELETE [hash]` / `DELETE history`) return their 401/403/502 errors as `{ "message": "..." }`, not the shared `{ "error": ... }` envelope.

---

## Readarr-compatible surface (`/api/readarr/v1/*`)

Calibre-Web-targeted adapter that exposes a subset of Readarr's v1 API. The native `/api/*` surface stays unchanged. Both surfaces sit behind the same auth gate (see [Authentication](#authentication) above) - a session cookie or `X-Api-Key` both work; compat clients (Calibre-Web) send the `X-Api-Key` header. All five bookkeeprr content types are surfaced through this API. Errors use Readarr's `{ "message": "...", "description?": "..." }` envelope, not the native `{ "error": ... }` one.

### Quick reference

| Method | Path                              | Purpose                                                               |
| ------ | --------------------------------- | --------------------------------------------------------------------- |
| GET    | `/api/readarr/v1/system/status`   | Connection test.                                                      |
| GET    | `/api/readarr/v1/qualityprofile`  | Quality profiles, Readarr-shaped.                                     |
| GET    | `/api/readarr/v1/metadataprofile` | Five profiles: 1=ebook, 2=audiobook, 3=light_novel, 4=manga, 5=comic. |
| GET    | `/api/readarr/v1/rootfolder`      | Media roots, one per content type.                                    |
| GET    | `/api/readarr/v1/author`          | Authors (= bookkeeprr series), all 5 content types.                   |
| POST   | `/api/readarr/v1/author`          | Add a series to monitoring.                                           |
| GET    | `/api/readarr/v1/author/{id}`     | Single author detail.                                                 |
| PUT    | `/api/readarr/v1/author/{id}`     | Update `rootPath`, `monitoring`, `qualityProfileId`.                  |
| DELETE | `/api/readarr/v1/author/{id}`     | Delete the bookkeeprr series (files on disk untouched).               |
| GET    | `/api/readarr/v1/author/lookup`   | Federated metadata search (`?term=…`), 5 providers.                   |
| GET    | `/api/readarr/v1/book`            | Books (= volumes of all series).                                      |
| POST   | `/api/readarr/v1/book`            | Add a single-volume series.                                           |
| GET    | `/api/readarr/v1/book/{id}`       | Single book detail.                                                   |
| PUT    | `/api/readarr/v1/book/{id}`       | Update volume title.                                                  |
| DELETE | `/api/readarr/v1/book/{id}`       | Delete the volume; series stays.                                      |
| GET    | `/api/readarr/v1/book/lookup`     | Federated lookup, Book-shaped (`?term=…`).                            |
| GET    | `/api/readarr/v1/command`         | Recent jobs in Readarr command shape (last 50).                       |
| GET    | `/api/readarr/v1/command/{id}`    | Single command status - maps to bookkeeprr `jobId`.                   |
| POST   | `/api/readarr/v1/command`         | Dispatches to bookkeeprr's job kinds (see below).                     |
| GET    | `/api/readarr/v1/queue`           | Live downloads, paginated.                                            |
| GET    | `/api/readarr/v1/history`         | Grabbed + imported + failed events, paginated.                        |
| GET    | `/api/readarr/v1/health`          | Empty array (stub - Readarr clients only check the shape).            |

### Authentication

Single static `X-Api-Key`, generated under **Settings → API Access** - the intended mode for Readarr-compat clients (Calibre-Web's integration only knows how to send this header). The `/api/readarr/v1/*` routes pass through the same global auth gate as the native surface, so a session cookie works too; what does NOT work is a bare request - once any user exists, requests without a valid key or session get 401 (`/api/health` and `/api/first-run/*` stay exempt).

```bash
# Generate
curl -X PATCH http://localhost:3000/api/settings/api-key \
  -H 'Content-Type: application/json' \
  -d '{"action":"generate"}'

# Use
curl -H 'X-Api-Key: <key>' http://localhost:3000/api/readarr/v1/system/status
```

### Mapping rules

- **Readarr Author** = bookkeeprr `series`, one-to-one. Multiple series by the same human author surface as multiple Readarr authors.
- **Readarr Book** = bookkeeprr `volume`. Single-volume series have exactly one book.
- **`foreignAuthorId` / `foreignBookId`** = `openlibrary_id` (ebook), `asin` (audiobook), `anilist_id` (light_novel, manga), `mangadex_id` (manga fallback when no anilist_id), `comicvine_id` (comic). All emitted as strings.
- **Comic author name** falls back to `publisher` when present.
- **All 5 content types** appear in `/author` and `/book` responses.

### `POST /command` semantics

| Readarr command                                                     | bookkeeprr job                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `RefreshAuthor`, `RefreshBook`, `RefreshAuthors` (with `authorId`)  | `metadata_hydrate` (or `comicvine_hydrate` for comic series) |
| `AuthorSearch`, `BookSearch`, `MissingBookSearch` (with `authorId`) | `missing_search`                                             |
| `RescanFolders`                                                     | `library_scan`                                               |
| anything else                                                       | accepted, no-op (status `completed`)                         |

The response's `id` is the bookkeeprr `jobId`; poll `GET /command/{id}` for status.

### `/queue` notes

- Returns rows from `downloads` where `status != 'imported'`. Imported downloads move to `/history`.
- `sizeleft` is `0` and `timeleft` is `"00:00:00"` - bookkeeprr doesn't track byte-level progress at the queue level.
- Pagination via `?page=` and `?pageSize=` (max 200).

### `/history` notes

- Union of three event types: `grabbed` (every download), `bookFileImported` (every imported library file), `downloadFailed` (failed downloads with errors).
- Capped at the most recent 1000 events to bound the in-memory merge.
- Events for cascade-deleted series disappear. A permanent audit log is available via the audit endpoints.

### Configuring Calibre-Web

Point Calibre-Web's Readarr integration at `http://<host>:<port>/api/readarr/v1`, paste the X-Api-Key, click Test. Calibre-Web will probe `system/status`, `qualityprofile`, `metadataprofile`, and `rootfolder` - all four must return 200.

---

## Versioning & future work

There is **no API version prefix on the native surface.** Every native endpoint is at `/api/*`. The Readarr-compatible adapter lives at `/api/readarr/v1/*`. If we ever break the native API, we'll either version it (`/api/v2/*`) or - more likely - add a `/api/native/v1/*` alias for stability and let `/api/*` drift forward.

**There is deliberately no jobs-list endpoint.** The Jobs family is `GET /api/jobs/[id]` (poll a job you enqueued) plus `POST /api/jobs/run` - there is no `GET /api/jobs`. Job rows are an internal queue, pruned by housekeeping; endpoints that enqueue work always hand you the `jobId` to poll. (The Readarr-compat surface exposes `GET /api/readarr/v1/command` - the 50 most recent jobs in Readarr's command shape - if you really need a recent-jobs view.)
