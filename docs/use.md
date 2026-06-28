# Using bookkeeprr

End-to-end user guide. Assumes the app is already running - for getting there see [deploy.md](./deploy.md).

## The mental model

bookkeeprr is a **series-level monitor**. You tell it about a series once (via metadata search); it then watches indexers for matching releases, grabs the good ones through qBittorrent, and imports the resulting files into a content-type-aware library layout.

| Content type | Subdir         | Metadata provider                   | Indexer matching                  |
| ------------ | -------------- | ----------------------------------- | --------------------------------- |
| Manga        | `/comics/`     | AniList                             | Nyaa.si (cat 3_1 / 3_3)           |
| Comic        | `/comics/`     | ComicVine                           | Nyaa.si                           |
| Light novel  | `/comics/`     | AniList (LN format)                 | Nyaa.si                           |
| Ebook        | `/books/`      | OpenLibrary + Google Books fallback | configured indexers               |
| Audiobook    | `/audiobooks/` | Audnex (Audible scrape)             | configured indexers               |

Files land under `${BOOKKEEPRR_MEDIA_ROOT}/{subdir}/{naming-template-output}`. The naming template is per-content-type and per-key (series_folder, volume, chapter, batch) - see Settings → Naming Templates.

## First-run wizard

The first time you load `/` after a fresh install, you'll be redirected to `/first-run`. Four steps to complete:

1. **Create the admin account** - username + password. This account can create other users from Settings → Users. The first admin cannot be deleted while it's the only admin.
2. **Default quality profile** - used when adding new series. Specifies preferred languages, scanlation groups (manga), size bounds, and originals-vs-translations preference. You can edit it later under Settings → Quality Profiles.
3. **Media root sanity check** - bookkeeprr verifies the configured `BOOKKEEPRR_MEDIA_ROOT` is writable and has the expected subdirs. It auto-creates `comics/`, `books/`, `audiobooks/` if missing.
4. **qBittorrent connection** (optional during wizard, can be filled later).

After the wizard completes, you're logged in and redirected to the library.

## User accounts

bookkeeprr supports multiple user accounts sharing a single library. The first-run wizard creates the first **admin** account; admins can create additional accounts (admin or user role) from **Settings → Users**.

**Roles:**

- **Admin** - full access including user management.
- **User** - full library access, no user-management permissions.

There is no `/signup` page. New accounts are admin-created. When an admin creates a user, they set an initial password and (by default) require the user to change it on first login.

**Forgot your password?** Ask an admin to reset it from **Settings → Users → Reset password**. The admin sets a temporary password; you change it on next login.

**Locked out as the only admin?** See [maintain.md → Resetting a forgotten admin password](./maintain.md#resetting-a-forgotten-admin-password).

**Sessions** are valid for 30 days (rolling - activity resets the clock). Log out from the user menu or via `POST /api/auth/logout`.

## Adding a series

Pick the content type from the picker at `/add`. Each type has its own search UI shaped to the provider:

### Manga (AniList)

1. Type the title - debounced search hits AniList's GraphQL.
2. Click a result. The sheet pre-fills English/Romaji/Japanese titles, status, cover, total volumes.
3. Pick a quality profile + monitoring mode + granularity (volume vs chapter).
4. **Save.** A `metadata_hydrate` job enqueues to fetch MangaDex chapter list in the background.

### Comic (ComicVine)

Same flow as manga but the search hits ComicVine. Requires the user to set a ComicVine API key under Settings → ComicVine - bookkeeprr cannot ship a key (terms of use forbid sharing).

Comics use the issue-numbered naming convention by default (`{series_title} #{chapter:000}`). Configure under Settings → Naming Templates → comic.

### Light novel (AniList)

AniList's `MANGA` type also covers light novels (via the `LIGHT_NOVEL` format filter). The search UI filters AniList results to `format=LIGHT_NOVEL` and surfaces the author from the Staff edges (extracted via the `Story`-role regex).

### Ebook (OpenLibrary + Google Books)

Two tabs at `/add/ebook`:

- **Single book** - picks a one-volume entry. Best for standalone novels.
- **Book series** - picks the canonical seed book; user enters the total volume count manually.

OpenLibrary is the primary source (free, no key, ISBN-rich). When a metadata field is missing on OL (cover art, description, page count), the composer falls back to Google Books keyed by ISBN.

### Audiobook (Audnex)

Single-flow only (multi-volume audiobook series are rare; add each as its own series). Audnex is the community-maintained Audible metadata API; bookkeeprr targets the hosted instance at `api.audnex.us`. ASIN is the canonical id; narrator metadata is surfaced distinctly from author.

## Configuring indexers

Settings → Indexers. Two indexer kinds ship:

### Nyaa.si

Seeded enabled by default for manga + comic. No credentials needed. Polls Nyaa's RSS for the configured categories every 15 minutes.

Per-content-type category map. Defaults:

- manga → `3_1` (English-translated literature)
- comic → `3_1`

You can extend the content-type allowlist (e.g., enable Nyaa for ebooks if you have a niche source there). Untoggled types are simply not polled by this indexer.

### Private trackers and additional indexers

Additional indexers can be added under Settings - Indexers. Supported kinds include Torznab (for Prowlarr-synced sources), MAM (MyAnonaMouse), and others. Each kind has its own credential fields (API key, passkey, session cookie) configured in the edit sheet. Per-indexer content-type allowlists narrow which types each indexer is searched for.

## Configuring qBittorrent

Settings → qBittorrent. The qBT web UI must be running and reachable from the bookkeeprr container.

1. **Host / port / username / password / use HTTPS** - standard qBT WebUI connection.
2. **Test connection** - bookkeeprr fires a login + an API ping, shows ✅ if both succeed.

bookkeeprr never installs qBT for you. It expects a running instance with a category-aware download client. After the connection works, each grab will:

- Set qBT category to `bookkeeprr-{contentType}` (e.g., `bookkeeprr-manga`).
- Save to `{BOOKKEEPRR_MEDIA_ROOT}/downloads/incomplete/` until done, then hand off to the importer.

## Naming templates

Settings → Naming Templates. Per-content-type per-key templates use a small token DSL:

| Token                         | Meaning                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| `{series_title}`              | Series title (English first, then Romaji, then Native)              |
| `{series_year}`               | Year of first publication                                           |
| `{author}`                    | Primary author                                                      |
| `{narrator}`                  | Primary narrator (audiobooks only)                                  |
| `{publisher}`                 | Publisher (comics; uses `(?<!Annual ...)` lookbehind on parse side) |
| `{volume}` / `{volume:00}`    | Volume number, optionally zero-padded                               |
| `{chapter}` / `{chapter:000}` | Chapter number; preserves `42.5` and `42a`                          |
| `{chapter_range}`             | E.g., `001-012` for batches                                         |
| `{group}`                     | Scanlation/release group name                                       |
| `{ext}`                       | File extension                                                      |

Default templates by content type:

| Type        | series_folder                                | volume / file                                   |
| ----------- | -------------------------------------------- | ----------------------------------------------- |
| manga       | `{series_title}`                             | `{series_title} - v{volume:00} [{group}].{ext}` |
| comic       | `{publisher}/{series_title} ({series_year})` | `{series_title} #{chapter:000} [{group}].{ext}` |
| light_novel | `{author}/{series_title} Light Novel`        | `{series_title} - v{volume:00} [{group}].{ext}` |
| ebook       | `{author}/{series_title}`                    | `{series_title} - v{volume:00} [{group}].{ext}` |
| audiobook   | `{author}/{series_title}`                    | `{series_title}.{ext}`                          |

The `:sane` formatter is auto-applied per token (strips path separators inside values; literal `/` between tokens survives). Editing a template doesn't rewrite existing files - only new imports.

## Notifications

Settings → Notifications. Per-event toggles for grab-success, import-success, failure. Two transports:

### Discord

Webhook URL from a Discord channel ("Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL"). Embeds use the design system's color palette per event.

### Apprise

Apprise's REST API endpoint (`http://your-apprise:8000/notify/<token>` if self-hosted, or any consumer that accepts `{ title, body, type: 'info'|'success'|'failure' }` JSON over POST). Apprise covers 80+ providers - Pushover, Telegram, ntfy, Slack, Gotify, mailto:, etc.

Click **Send test** at the bottom of the form to fire a sample notification on every configured transport.

Notification failures are logged but **never block a grab or import**.

## Library sync (player notifications)

Settings → Library Sync. Same shape as notifications: per-player config + per-content-type allowlist + test button.

### Audiobookshelf

1. Get your AB API token (Audiobookshelf admin UI → `/config/users` → your user → API token).
2. Paste base URL + token. Save.
3. Click the library picker - it fetches your AB library list. Pick the audiobook library.
4. Default content-type allowlist is `['audiobook']`. Extend to `ebook` if your AB server hosts ebooks too (AB ≥ v2.4).
5. Click **Send test scan** - AB shows a scan-in-progress banner if it worked.

### Calibre Content Server

1. Paste your Calibre URL (default `http://calibre:8080`).
2. Optional: username + password if your Calibre is auth-protected.
3. Library ID - default `0` for single-library installs.
4. Default content-type allowlist is `['ebook']`.
5. **Send test refresh** fires `POST /cdb/cmd/refresh-library/0?library_id=...`.

After an import lands, bookkeeprr fires `POST /api/libraries/{id}/scan` (AB) and/or `POST /cdb/cmd/refresh-library` (Calibre) - fire-and-forget, errors logged but never escalate.

## Day-to-day

### Watching a series for new releases

- **Monitoring: all** - every release matching the series is fair game for auto-grab.
- **Monitoring: future** - only releases dated after the series add time are eligible (avoids backfilling).
- **Monitoring: missing** - only fills gaps in `totalVolumes`/`totalChapters` (Sonarr's "monitored episodes" idiom).
- **Monitoring: none** - series is tracked but auto-grab is off (you can still grab manually from the release list).

### Quality profile

Edit at Settings → Quality Profiles. Four levers:

- **Preferred groups** - `LH`, `WSJ`, `Glorith-HD`, etc. Releases from preferred groups score higher.
- **Preferred languages** - typically `["en"]` for English readers.
- **Min/max size** - releases outside bounds are rejected entirely.
- **Prefer originals** - for manga, prefer Japanese-source releases over fan-translated.
- **Prefer complete batches** - batch torrents score higher than per-chapter when totalVolumes is known.

### Interactive search

On any series detail page, the **Releases** tab shows what indexers have seen. Click **Interactive search** to run a one-shot query (with optional query override - useful when AniList's title doesn't match the scene name).

Manually grab any release row regardless of auto-grab logic. The download appears in qBT under the right category.

### Re-routing a misrouted file

On the series detail page, each owned file shows a **Re-route** button. Opens a sheet:

1. Pick destination series (typeahead).
2. Volume or chapter radio.
3. Number input.
4. Confirm → bookkeeprr moves the file to the new naming-engine path, updates the `library_files` row.

Useful when the parser routed a file to the wrong series, or when you renamed a series and want files to follow.

### Library pagination

`/library?page=2` works. Default page size is 20. Order is most-recently-added first; sort options coming in a future polish pass.

### Themes

Top-right of the topbar - 7 swatches. Click to retint the whole app's primary color. Choice persists in localStorage as `bookkeeprr-theme`. The names follow a Japanese vocabulary (Tsundoku = the practice of accumulating unread books; Kohaku = amber stone; Sakura = cherry blossom; Asagi = pale teal; Sora = sky; Moegi = fresh green; Shiro = white).

Content-type colors and status colors are fixed across themes - learning a content type's color works regardless of which accent the user picks.

## Backups + restore

Daily backups run automatically as part of the housekeeping job (3 AM UTC). They land under `${BOOKKEEPRR_CONFIG_DIR}/backups/bookkeeprr-YYYY-MM-DD.db`. Retention defaults: keep the last 7 daily files + the first-of-month for the last 12 months. Override via the env-var-equivalent settings page (Settings → Housekeeping).

To **restore**:

1. Stop the container.
2. Replace `${BOOKKEEPRR_CONFIG_DIR}/bookkeeprr.db` with the backup file.
3. Restart.

The file is a regular SQLite DB - `sqlite3 bookkeeprr.db` works for inspection.

See [maintain.md](./maintain.md) for more on backup verification and integrity checks.

## OpenID Connect (OIDC) sign-in

bookkeeprr supports a single OIDC provider alongside local username/password auth. Configure under **Settings → Authentication**.

**Required from your IdP:**

- **Issuer URL** - your provider's OIDC discovery base (no trailing path beyond what `.well-known/openid-configuration` is relative to).
- **Client ID** and **Client Secret** for a registered "confidential" client.
- **Redirect URI** registered on the IdP side: `https://<your-bookkeeprr-host>/api/auth/oidc/callback`.
- **Claims** in the ID token: `sub` (required), `preferred_username` (or override the claim name), `email`, `groups`.

**Group-driven authorization:**

- **Allowed groups** - a user must be a member of at least one to sign in. Leave empty to accept any successful OIDC token (trusted-IdP mode).
- **Admin groups** - members are made admin; non-members are made regular users. Computed on every login. bookkeeprr will refuse to demote the only remaining admin.

**Tested provider patterns:**

- **Authentik** - bind your `bookkeeprr-users` and `bookkeeprr-admins` groups via a Group property mapping that emits a `groups` claim.
- **Authelia** - set `groups` and `email` claims; map your `bookkeeprr_users` LDAP group.
- **Keycloak** - enable the "groups" client scope; map `preferred_username`, `email`, and `groups`.

**Local + OIDC coexistence.** Both login paths work simultaneously. Local users keep their password; OIDC users have `password_hash = NULL`. A local user cannot be auto-converted to an OIDC user - if you want them to authenticate via OIDC, the admin must delete the local row first, then the user can sign in via OIDC (which provisions a fresh row).

**What OIDC does not do:**

- No RP-initiated logout - logging out clears the bookkeeprr session cookie but leaves the IdP session intact.
- No multi-provider support - exactly one OIDC IdP at a time.
- No account linking - if an OIDC `preferred_username` collides with an existing local username, login is rejected with HTTP 409.
- No refresh-token handling - bookkeeprr never calls the IdP again after the initial token exchange.

## Forward-auth (reverse-proxy SSO)

If you already run a reverse-proxy SSO solution (Authelia, Authentik, oauth2-proxy, Caddy `forward_auth`, Traefik forward-auth), bookkeeprr can use the identity headers your proxy injects instead of requiring users to log in twice. Configure under **Settings → Authentication → Forward-auth (reverse-proxy SSO)**.

**Required from your reverse proxy:**

- Identity headers on every request: `Remote-User` (required), `Remote-Email`, `Remote-Groups` (optional but recommended). Other conventions like `X-Forwarded-User` are supported - just change the header names in the settings.
- Each forwarded request must include `X-Forwarded-For` whose RIGHTMOST entry is the IP of the reverse proxy itself (this is what bookkeeprr matches against your trusted-proxy CIDR list).
- The reverse proxy MUST strip incoming `X-Forwarded-For` from the client before re-setting it - otherwise a client can spoof the trusted-proxy IP. Standard hygiene that every well-configured reverse proxy already does.

**Group-driven authorization:**

- **Allowed groups** - leave empty to accept any user the proxy authenticates; populate to restrict to a specific group. Empty is the trusted-IdP mode.
- **Admin groups** - members are made admin on every login. Recomputed each request. Last-admin guard prevents demoting the only remaining admin.

**Enabling forward-auth safely.** The settings UI requires you to click "Validate connection" first - bookkeeprr inspects the request you're currently making and confirms it carries the configured user header AND comes from a trusted CIDR. Only after validation passes can you flip the enable toggle. This prevents you from accidentally locking yourself out by enabling forward-auth when you're not actually behind the proxy.

**Local + forward-auth coexistence.** Forms login at `/login` always works. If a forward-auth request is missing (proxy down, direct LAN access, header stripped), the middleware falls through to the session-cookie path. Local accounts and OIDC accounts remain usable.

## Audit log + operational logs

Admins have two new pages under **Settings**:

- **Audit log** (`/settings/audit`) - chronological record of who did what. Auth events (login/logout/role recomputes for OIDC + forward-auth) and admin operations (settings changes, user create/delete/role-update/password-reset) all leave an immutable trail. Filter by action; click a row to see metadata + IP + user-agent.
- **Logs** (`/settings/logs`) - daily-rotated bookkeeprr log files written by the server. Same content as `docker logs bookkeeprr` shows; useful when you don't have shell access to the container.

**Retention.** Audit events are kept 30 days; log files are kept 7 days. Both are pruned by the housekeeping job at 3 AM UTC daily. Retention values are in the `housekeeping.visibility_retention` settings blob - adjust via the housekeeping settings page or by editing the row directly in the database.

**Privacy.** Settings audit events record CHANGED FIELD NAMES only, never the new field values. No clientSecrets / passwords / API keys ever land in the audit log.
