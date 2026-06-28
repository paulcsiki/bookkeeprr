# Maintaining bookkeeprr

Day-2 operations. If you haven't deployed yet, start with [deploy.md](./deploy.md).

## What bookkeeprr does without supervision

A correctly-deployed bookkeeprr instance runs forever without intervention. The `housekeeping` job - fired daily at **03:00 UTC** - handles:

| Step            | What                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------- |
| Job purge       | Delete terminal jobs (succeeded/failed/cancelled) older than the retention setting.         |
| Daily backup    | Snapshot the DB to `${BOOKKEEPRR_CONFIG_DIR}/backups/bookkeeprr-YYYY-MM-DD.db`.             |
| Backup pruning  | Keep last 14 daily backups + last 12 monthly-first-of-month backups.                        |
| Release pruning | Delete releases older than 30 days AND not in top-5-per-series-by-score AND not downloaded. |

You don't need to do anything for any of these. They're idempotent - running the job twice in a day is a no-op.

The other workers run on their own schedules:

- `indexer-poll` every 15 minutes (RSS).
- `missing_search` every 6 hours.
- `qbt_watch` every 2 minutes (download progress).
- `metadata_hydrate` / `mangadex_chapter_sync` / `comicvine_hydrate` on demand.

## Backups

### What gets backed up

Only the SQLite DB. **Your media files are not backed up by bookkeeprr** - back them up separately if you care.

The backup is a hot copy using `better-sqlite3`'s `db.backup()` method (WAL-safe; doesn't lock writers). The result is a fully consistent `.db` file you can restore by file-copy.

### Where backups land

```
${BOOKKEEPRR_CONFIG_DIR}/backups/
├── bookkeeprr-2026-05-24.db    # today
├── bookkeeprr-2026-05-23.db
├── ...                          # 13 more daily
├── bookkeeprr-2026-05-01.db    # monthly-first
├── bookkeeprr-2026-04-01.db
└── ...                          # up to 12 monthly
```

Files matching `bookkeeprr-YYYY-MM-DD.db` are managed by the housekeeping job. Files with any other name are **never deleted** by bookkeeprr - drop user-managed snapshots in the same dir if you want.

### How to back up off-host

The housekeeping job lands a snapshot at 03:00 UTC. After that, copy the day's file off-host however you like:

```bash
# Push to a remote host via rsync (cron-friendly)
0 4 * * * rsync -a /srv/bookkeeprr/config/backups/bookkeeprr-$(date -u +\%F).db backup-host:/backups/bookkeeprr/

# Or pull from elsewhere
rsync -a bookkeeprr-host:/srv/bookkeeprr/config/backups/ /backups/bookkeeprr/
```

For a fully ad-hoc backup outside the daily schedule, you can run the backup command yourself - but it's easier to just copy the file directly with the container stopped, or use sqlite3's `.backup` command online:

```bash
sqlite3 /srv/bookkeeprr/config/bookkeeprr.db ".backup '/path/to/ad-hoc-backup.db'"
```

### Restoring

1. **Stop the container.** Both processes write to the DB; you can't restore underneath a running app.
2. **Move the live DB out of the way:**
   ```bash
   mv /srv/bookkeeprr/config/bookkeeprr.db /srv/bookkeeprr/config/bookkeeprr.db.broken
   mv /srv/bookkeeprr/config/bookkeeprr.db-shm /srv/bookkeeprr/config/bookkeeprr.db-shm.broken 2>/dev/null
   mv /srv/bookkeeprr/config/bookkeeprr.db-wal /srv/bookkeeprr/config/bookkeeprr.db-wal.broken 2>/dev/null
   ```
3. **Copy a backup into place:**
   ```bash
   cp /srv/bookkeeprr/config/backups/bookkeeprr-2026-05-23.db /srv/bookkeeprr/config/bookkeeprr.db
   ```
4. **Start the container.** The worker will run any pending migrations against the restored DB on boot.

After the worker comes up and `/api/health` returns 200, browse the library to confirm the restore is healthy.

## Routine checks

These aren't required - bookkeeprr will tell you in the UI when something is wrong - but they're easy from the shell.

```bash
# Health
curl -s http://localhost:3000/api/health
# {"status":"healthy"}

# Recent activity
curl -s http://localhost:3000/api/downloads | jq '.downloads[] | {id, status, addedAt}'

# Backup directory listing
ls -lh /srv/bookkeeprr/config/backups/

# Database size
du -h /srv/bookkeeprr/config/bookkeeprr.db
# Typical: 5-50 MB for libraries of 100-5000 series

# Worker liveness
docker logs --tail 50 bookkeeprr | grep -E 'tick|error|warn'
```

## Inspecting the database

You can query the live database without stopping the app - SQLite WAL mode supports concurrent readers.

```bash
sqlite3 /srv/bookkeeprr/config/bookkeeprr.db
sqlite> .tables
sqlite> SELECT id, content_type, title_english, monitoring FROM series LIMIT 20;
sqlite> SELECT kind, status, COUNT(*) FROM jobs GROUP BY kind, status;
sqlite> SELECT status, COUNT(*) FROM downloads GROUP BY status;
```

**Do not** issue writes (`INSERT`, `UPDATE`, `DELETE`) against the live DB unless you really know what you're doing. bookkeeprr expects to own this DB. The DAL takes a write lock; ad-hoc writes will not coordinate with in-flight jobs.

If you need to make a manual fix, **stop the container first**, edit, then restart.

## Reading the logs

bookkeeprr emits one structured JSON line per event via pino.

| Field       | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `level`     | 10 trace · 20 debug · 30 info · 40 warn · 50 error · 60 fatal  |
| `time`      | ISO-8601 timestamp                                             |
| `component` | Module name (e.g. `metadata_hydrate`, `qbt_watch`, `importer`) |
| `msg`       | Human message                                                  |
| `err`       | Error string if applicable                                     |
| `jobId`     | Job row ID (for component=jobs)                                |
| `seriesId`  | Series row ID (where applicable)                               |

**Useful filters with `jq`:**

```bash
# Warnings and errors only
docker logs bookkeeprr 2>&1 | jq 'select(.level >= 40)'

# Just importer activity
docker logs bookkeeprr 2>&1 | jq 'select(.component=="importer")'

# Job durations
docker logs bookkeeprr 2>&1 | jq 'select(.msg | test("job complete"))'
```

To raise log volume temporarily, set `BOOKKEEPRR_LOG_LEVEL=debug` and restart. Set back to `info` once you're done - `debug` is noisy.

## Updating bookkeeprr

```bash
docker pull ghcr.io/paulcsiki/bookkeeprr:latest
docker stop bookkeeprr && docker rm bookkeeprr
# Re-run docker run / docker-compose up -d
```

Migrations apply automatically. The first request after the update may take a few seconds while migrations finish.

**There is no version pin today.** The project pushes to `:latest` on every `main` push. If you want immutable deploys, pin the image digest from `docker inspect` rather than the tag. See [deploy.md → Image](./deploy.md#image).

## Common operational issues

### "Health endpoint returns 503"

The worker has not emitted a heartbeat in over 30 seconds. Check worker logs:

```bash
docker logs --tail 200 bookkeeprr | jq 'select(.component=="worker")'
```

Most common causes: a job is wedged (look for `failed` status with a stack trace), the DB is locked (someone is holding a long-running transaction), or the container was OOMKilled. Restart with `docker restart bookkeeprr` and watch for it to recur.

### "A download is stuck in 'importing' forever"

The `import` job claims a download then renames the files into the library. If it fails partway through (disk full, permissions, EXDEV across filesystems), the row stays as `importing` and won't retry automatically.

```bash
# Find the wedged download
sqlite3 /srv/bookkeeprr/config/bookkeeprr.db "SELECT id, qbt_hash, status, error FROM downloads WHERE status='importing';"

# Inspect the qBT torrent's save path - is it on the same filesystem as BOOKKEEPRR_MEDIA_ROOT?
# bookkeeprr will hardlink within a filesystem, but cross-fs falls back to copy.
```

Once you've fixed the underlying issue (free space, perms, etc.), the download will retry automatically.

### "An indexer is failing"

`Settings → Indexers` shows the last error per indexer. Common failures:

- **Nyaa.si 5xx** - Nyaa goes down occasionally. The next poll cycle will retry.
- **Private tracker 401** - your passkey changed or expired. Re-enter it under Settings - Indexers for that tracker. Empty passkey on PATCH means "leave unchanged" - don't accidentally clear by leaving the field empty.
- **Rate-limited** - bookkeeprr enforces rate limits per-indexer internally; if the tracker still rate-limits, something else may be hitting them on your account.

### "Series detail page loads slow"

Series with >700 volumes or chapters hit a known limitation - the volume/chapter tabs don't paginate yet. Library grid pagination is implemented; tab pagination is still a TODO.

Workaround: use the API directly (`GET /api/series/[id]` with appropriate filters once we add them) or pull volume/chapter rows from the DB.

### "Disk filling up unexpectedly"

Likely culprits, in order of probability:

1. **Backups directory accumulating** - the housekeeping job should prune, but if it's failing, daily backups pile up. Check `ls /srv/bookkeeprr/config/backups/ | wc -l`. Should be ≤ 26 (14 daily + 12 monthly).
2. **Old releases not being pruned** - `releases` table grows unbounded if housekeeping is broken. Check row count: `SELECT COUNT(*) FROM releases;`. If > 100k, something's wrong.
3. **qBittorrent never deleting completed torrents** - bookkeeprr doesn't manage your qBT retention. Configure qBT's own seed-time / ratio limits.

### "Notifications aren't firing"

Visit `Settings → Notifications` and use the Test button. Each transport reports its own status:

- `discord: "not-configured"` - fill in the webhook URL.
- `discord: { error: "..." }` - check the URL and Discord's webhook is still alive.
- `apprise: "not-configured"` - fill in the Apprise server URL.
- Per-event toggles are checked **before** dispatch - if "On grab success" is off, no transport sees the event.

Notifications are fire-and-forget; failures never block the grab/import pipeline. Errors are logged at `level=40` (warn) - search logs for `component=notify`.

### "Library sync isn't refreshing Audiobookshelf / Calibre"

Settings → Library Sync. Test buttons hit the respective service and return a typed result. Common failures:

- ABS 401 - API token wrong. Generate a new one in ABS user settings.
- ABS 404 on `/api/libraries/<id>/scan` - wrong `libraryId`. Use the library-picker dropdown.
- Calibre `unsupported-version` - your calibre-content-server is older than v6. The refresh endpoint doesn't exist there. Upgrade Calibre.
- Calibre 401 - wrong username/password. Calibre allows anonymous content-server access; if you have no auth, leave both fields empty.

Library sync is per-content-type: audiobook imports → ABS; ebook imports → Calibre. Manga/comic/light-novel imports are no-ops at the library-sync layer.

## Tuning knobs

bookkeeprr deliberately has few configuration knobs. The ones that exist:

| Knob                       | Where                                        | Default                                 |
| -------------------------- | -------------------------------------------- | --------------------------------------- |
| Backup retention           | `settings.backup_retention` (UI: not yet)    | 14 daily + 12 monthly                   |
| Job purge retention        | `settings.job_retention` (UI: not yet)       | (configurable; check `housekeeping.ts`) |
| Release pruning thresholds | hardcoded in `housekeeping.ts`               | maxAgeDays=30, keepTopRankPerSeries=5   |
| Pagination - library       | hardcoded                                    | limit=50 per page                       |
| Pagination - downloads     | hardcoded                                    | last 200                                |
| Indexer rate limits        | per-indexer in `src/server/integrations/...` | Nyaa 1 req/sec; others vary by kind     |
| qBT poll cadence           | cron `*/2 * * * *`                           | every 2 minutes                         |
| Indexer poll cadence       | cron `*/15 * * * *`                          | every 15 minutes                        |
| Missing-search cadence     | cron `0 */6 * * *`                           | every 6 hours                           |

To change anything that lives in code (cadences, pruning thresholds), you'd need to fork the repo. Most operators never need to touch any of these.

## Stopping cleanly

`docker stop bookkeeprr` sends SIGTERM, which propagates to `tini`, which forwards to both the web and worker processes. The web server finishes in-flight requests; the worker finishes its current job claim and exits. SQLite's WAL is checkpointed on a clean shutdown.

If `docker stop` times out (default 10s - set `--time=30` to allow more), the container is force-killed. SQLite WAL recovers on next start, so a hard kill won't corrupt the DB, but in-flight imports can leave half-renamed files behind. Look in `dist/worker.cjs` logs for `import` job failures and re-trigger them from the UI.

## Resetting a forgotten admin password

If the only admin loses their password, recover via the bundled CLI script.

**Inside the container:**

```bash
docker exec -it bookkeeprr node /app/dist/reset-user-password.cjs <username> <newPassword>
```

This:

- Validates the password (minimum 8 characters).
- Hashes the new password with argon2id.
- Sets `must_change_password=true` so the user is forced to pick a new password on next login.
- Revokes the user's existing sessions.

**If you've forgotten the admin username**, find it via sqlite:

```bash
docker exec bookkeeprr sqlite3 /config/bookkeeprr.db \
  "SELECT username FROM users WHERE role='admin' AND disabled=0;"
```

The script exits non-zero on:

- missing arguments (1)
- user not found (2)
- password policy violation (3)
- DB error (4)

## When to escalate

If you hit something that isn't covered here:

- Bug or unexpected behavior: open an issue on the repo. Include log excerpts, the action you took, and what you expected.
- Data corruption suspected: stop the container immediately, copy the live DB and the WAL/SHM files off-host before anything else, then restore from yesterday's backup.
- Performance regression: capture `/api/health` response time + a 60-second log sample at `debug` level. Most slowness traces to a single slow indexer or a long-running query.

## OIDC troubleshooting

**Symptom: "OIDC provider could not be reached" (HTTP 502 on `/api/auth/oidc/start` or `/test`).**

bookkeeprr cached the discovery document for an hour and either the IdP's discovery endpoint is down or the cache holds a stale entry. Restart the container to clear the in-memory cache, or wait for the 1-hour TTL.

**Symptom: "State mismatch" on callback.**

The `bookkeeprr_oidc_pending` cookie either expired (10-minute TTL) or was stripped by a reverse proxy. Check that your proxy forwards cookies on `/api/auth/oidc/*` and that the user completed the IdP flow within 10 minutes of clicking the SSO button.

**Symptom: "A local account already uses this username" (HTTP 409).**

A local user (`auth_source='local'`) owns the `preferred_username` that the IdP wants to provision. Either delete the local user from **Settings → Users**, or change the IdP's `preferred_username` mapping for that user.

**Symptom: after changing the configured `issuer` URL, OIDC users get HTTP 409 on next login.**

Their stored `oidc_issuer` no longer matches the new value, so the user lookup misses. Delete the affected OIDC users and let them re-provision on next sign-in.

**Symptom: an admin's role flipped to "user" after OIDC login.**

Their `groups` claim no longer includes one of the configured `adminGroups`. Check the IdP-side group assignment. The last-admin guard prevents demoting the only remaining admin - if it fires, the role stays admin and a `oidc_role_recompute` log entry with `guardFired: true` is emitted.

**Resetting the OIDC cookie secret.**

bookkeeprr stores a per-instance HMAC secret in the `oidc-cookie-secret` settings row. To rotate it (which invalidates any in-flight sign-in attempts), delete the row:

```bash
docker exec bookkeeprr sqlite3 /config/bookkeeprr.db \
  "DELETE FROM settings WHERE key='oidc-cookie-secret';"
```

The next OIDC start will generate a fresh secret.

## Forward-auth troubleshooting

**Symptom: "Cannot enable forward-auth - your current request did not pass validation".**

Click "Validate connection" in **Settings → Authentication → Forward-auth**. The diagnostic panel will tell you which check is failing:

- **Peer IP not in CIDR list.** Add the IP shown in the diagnostic to the trusted-proxy CIDR list. Common gotchas: docker bridge IPs (`172.17.0.0/16`), kubernetes pod CIDRs, IPv6 link-local.
- **User header not present.** Your reverse proxy isn't forwarding the configured header name. Check the proxy's auth_request / forward_auth configuration. Authelia uses `Remote-User` by default; oauth2-proxy uses `X-Forwarded-User`; Caddy and Traefik are configurable.

**Symptom: forward-auth user gets HTTP 401 after working previously.**

The user's `Remote-User` value collides with a local or OIDC account that was created later, or their group membership changed. Check the `forward_auth_login_failure` event in the pino log - the `reason` field will be `username_conflict`, `no_allowed_group`, or `auto_create_disabled`.

**Symptom: forward-auth user keeps getting authenticated as the wrong user.**

The session cookie is stale (cookie says user X, proxy says user Y). bookkeeprr automatically revokes the stale cookie and creates a fresh session on the next request, so this should self-heal. If it persists, clear cookies for the bookkeeprr origin.

**Symptom: turning forward-auth OFF still authenticates users via headers.**

That should not happen - `enabled: false` short-circuits `tryForwardAuth` entirely. If you see this, check that the saved `forwardAuthConfigSetting` row actually has `enabled: false`:

```bash
docker exec bookkeeprr sqlite3 /config/bookkeeprr.db \
  "SELECT value_json FROM settings WHERE key='forward-auth-config';"
```

## Configuration reference (env vars)

bookkeeprr's configuration is split: infrastructure-level settings live in environment variables (set in your docker-compose or systemd unit); behavioral / multi-tenant settings live in the SQLite settings table (editable via the UI). Forward-auth introduces **no new env vars** - all forward-auth configuration is in the DAL (`forwardAuthConfigSetting`).

| Env var                 | Default     | Purpose                                                                                                                                                                 |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOOKKEEPRR_CONFIG_DIR` | `/config`   | Where bookkeeprr writes its SQLite DB + backups + naming preview cache.                                                                                                 |
| `BOOKKEEPRR_MEDIA_ROOT` | `/media`    | Root of the library tree. Per-content-type subfolders (`/media/comics`, `/media/books`, etc.) live below this.                                                          |
| `BOOKKEEPRR_DB_PATH`    | _(derived)_ | Override the DB file path. Defaults to `<CONFIG_DIR>/bookkeeprr.db`.                                                                                                    |
| `BOOKKEEPRR_PORT`       | `3000`      | HTTP listen port.                                                                                                                                                       |
| `BOOKKEEPRR_LOG_LEVEL`  | `info`      | One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `BOOKKEEPRR_7Z_BIN`     | `7zz`       | Path to the 7zip binary used by the importer. The Debian-bookworm-slim Dockerfile installs `p7zip-full` (which provides `7z`), so the official image sets this to `7z`. |

All other configuration - qBittorrent connection, indexer settings, ComicVine API key, OIDC issuer/clientId, forward-auth trusted-proxies + headers, etc. - lives in the `settings` table and is edited via the bundled UI.

## Audit + log file maintenance

**Where the log files live.** `<BOOKKEEPRR_CONFIG_DIR>/logs/bookkeeprr-YYYY-MM-DD.log`. New file each day at 00:00 UTC. Old files deleted by housekeeping after `logRetentionDays` (default 7).

**Audit DB growth.** Audit events sit in the `audit_events` SQLite table with three indexes. At typical workloads (a few hundred events per day) the table is small - a year of retention would be a few MiB. To check the row count:

```bash
docker exec bookkeeprr sqlite3 /config/bookkeeprr.db \
  "SELECT COUNT(*) FROM audit_events;"
```

**Manual retention override.** To change retention days via the database (if the UI is unavailable), edit the setting row directly:

```bash
docker exec bookkeeprr sqlite3 /config/bookkeeprr.db \
  "UPDATE settings SET value_json = '{\"auditRetentionDays\":90,\"logRetentionDays\":14}' WHERE key='housekeeping.visibility_retention';"
```

The change takes effect at the next housekeeping run (3 AM UTC). To force-prune immediately, manually trigger the housekeeping job from the Jobs page.

**Path-traversal guard.** The `/api/audit/logs/files/[name]` route only accepts filenames matching `^bookkeeprr-\d{4}-\d{2}-\d{2}\.log$`. Any other input → 400. Read attempts cannot reach outside the `<CONFIG_DIR>/logs/` directory.

## E2E test harness

bookkeeprr ships a Playwright + Docker E2E suite under `tests/e2e/`. It exercises the auth + admin happy paths through a real browser against the production Docker image. CI runs the suite only on manual `workflow_dispatch` (PRs and main pushes use the fast lint+typecheck+unit+integration path in `ci.yml`).

### Running locally

Prerequisites: Docker (or podman with podman-compose shim), pnpm.

```bash
# One-time browser install
pnpm exec playwright install chromium

# Run the full suite (~5-10 minutes; compose down/up between spec files)
pnpm test:e2e

# Headed mode for debugging
pnpm test:e2e:headed

# Single file
pnpm test:e2e tests/e2e/04-oidc.e2e.ts

# Grep pattern
pnpm test:e2e -g "OIDC"
```

The orchestrator (`scripts/e2e-run.ts`) handles `docker build`, `docker compose up -d`, polling `/api/health`, the Playwright run, and the final `docker compose down -v --remove-orphans`.

### Running on CI

Go to **Actions → E2E → Run workflow** in the GitHub UI. Optional `spec_filter` input passes a grep pattern to Playwright. Artifacts on completion:

- `playwright-report` (14d retention) - HTML report, always uploaded.
- `playwright-traces` (14d retention) - on failure.
- `container-logs` (7d retention) - per-service pino output on failure.

### Compose topology

Three services in `docker-compose.e2e.yml`:

- **bookkeeprr** (from `Dockerfile`, tagged `bookkeeprr:e2e`) on host port 13000. Config + media are `tmpfs` so teardown is instant.
- **mock-oauth2-server** (`ghcr.io/navikt/mock-oauth2-server:2.1.10`) on host port 18080. Pre-configured to issue tokens for issuer `bookkeeprr` with `alice` as the default user.
- **caddy** (`caddy:2-alpine`) on host port 18081. Reverse-proxies bookkeeprr and injects `Remote-User: alice` + group claims for the forward-auth specs.

Caddyfile at `tests/e2e/fixtures/Caddyfile`. mock-oauth2 config inlined in the compose's `JSON_CONFIG` env var.

### Adding new specs

Place specs at `tests/e2e/NN-name.e2e.ts` (numeric prefix for sort order). Each file must call `composeDownUp()` in `test.beforeAll` for per-file isolation:

```ts
import { test } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';

test.describe.configure({ timeout: 120_000 });
test.beforeAll(async () => {
  composeDownUp();
});
```

### Coverage + open TODOs

The current suite has happy paths for the first-run wizard, forms sign-in, user creation + deletion (via API), OIDC config-save, forward-auth config-save, and the Caddy proxy chain. Several specs are skipped with `test.skip` and associated TODO comments - they need interactive iteration with traces to nail down selectors, openid-client + mock-oauth2 negotiation, and the through-Caddy bootstrap-ordering puzzle. Grep `tests/e2e` for `test.skip` to enumerate them.

## Housekeeping retention

Daily 03:00 housekeeping cron applies four retention policies. Admin-configurable at `/settings/housekeeping`; persisted in the `settings` KV table.

| Knob                         | Default | Range   | Effect                                                                           |
| ---------------------------- | ------- | ------- | -------------------------------------------------------------------------------- |
| Jobs · `terminalDays`        | 30      | 1-3650  | Days to keep completed background-job rows. Older completed rows are deleted.    |
| Jobs · `errorDays`           | 90      | 1-3650  | Days to keep failed background-job rows. Older failed rows are deleted.          |
| Backups · `daily`            | 14      | 0-365   | Latest N daily database snapshots to keep. 0 disables daily pruning.             |
| Backups · `monthlyDay1`      | 12      | 0-365   | Day-1-of-month snapshots to keep separately from daily ones.                     |
| Audit · `auditRetentionDays` | 30      | 1-3650  | Days to keep `audit_events` rows.                                                |
| Audit · `logRetentionDays`   | 7       | 1-365   | Days to keep rotated `<CONFIG_DIR>/logs/bookkeeprr-YYYY-MM-DD.log` files.        |
| Releases · `keepPerSeries`   | 30      | 0-10000 | Top-N scored releases per series that are spared from pruning regardless of age. |
| Releases · `olderThanDays`   | 90      | 1-3650  | Releases older than this AND outside the top-N AND not downloaded are deleted.   |

All four sections emit `settings.update` audit events with the changed-field names recorded (no values - secret-safe by construction). The retention defaults match the original hardcoded constants, so installs that don't touch the UI see no behaviour change.

## Indexer scheduling

Every enabled indexer is polled automatically. A fanout job (`indexer_poll_fanout`) runs every minute and enqueues an `indexer_poll` job for any indexer whose `lastRssAt` is older than its `pollIntervalSeconds`. The default poll interval is **900s (15 minutes)** - adjustable per-indexer at `/settings/indexers` via the "Poll every" field. Valid range: 60-86400 seconds (1 min to 24 hr).

Disabled indexers never poll. The fanout drains the `indexer_poll` queue at the end of each tick, so the just-enqueued jobs run in the same minute.

### Known quirk: deleted default indexers re-seed on worker restart

`seedDefaultIndexers` ensures a default Nyaa.si row exists, keyed off `kind` only. If you delete the default Nyaa row via the UI and restart the worker, the seed function recreates it (with default settings). Soft-disable via the "enabled" toggle is the recommended way to suppress an indexer without losing config.

### Adding a third indexer

- UI: `/settings/indexers` → "Add indexer" button → fill kind + name + baseUrl + config → save.
- API: `POST /api/indexers` with the same body shape. Admin-only.

Returns 201 with `{ id }`. Emits an `indexer.create` audit event.

### Deleting

- UI: per-row delete button with confirm dialog.
- API: `DELETE /api/indexers/<id>`. Admin-only.

Hard delete. Cascades to `releases` (and through them, `downloads`) via FK constraints. Emits an `indexer.delete` audit event with `{kind, name}` in metadata.

## Matcher tuning

Two admin-tunable surfaces at `/settings/matcher`.

### Scoring weights

Integer weights drive release scoring during indexer-poll, missing-search, and interactive search; `minSeeders` is a hard pre-grab filter rather than a weight. Defaults match the original hardcoded constants:

| Field              | Default | Range    | Effect                                                                      |
| ------------------ | ------- | -------- | --------------------------------------------------------------------------- |
| `groupTopWeight`   | 100     | 0-1000   | Bonus for a release group at the top of the preferred-groups list.          |
| `groupStepDown`    | 10      | 0-100    | Step-down per rank as a group's position in the list grows.                 |
| `batchBonus`       | 30      | 0-1000   | Bonus when the release is a complete batch and the profile prefers batches. |
| `seederMultiplier` | 5       | 0-100    | Multiplier on `log10(seeders + 1)` - bigger means seeders matter more.      |
| `trustedBonus`     | 10      | 0-1000   | Bonus when the indexer marks a release as trusted (nyaa-only signal).       |
| `remakePenalty`    | -15     | -1000-0  | Penalty when the indexer marks a release as a remake (nyaa-only signal).    |
| `minSeeders`       | 1       | 0-10000  | Hard floor: releases with fewer seeders are rejected (`insufficient-seeders`) before grabbing - a dead torrent never completes and only stalls. `0` disables the filter. Enforced in `matchRelease`, not in scoring. |

### Adult content filter

When `enabled` (default `true`), releases whose indexer `category` is in `blockedCategories` are excluded from matching. Default blocklist covers nyaa adult/hentai categories: `["4_1", "4_2", "4_3", "4_4"]`. Each entry is up to 32 chars (so numeric category IDs expressed as strings work too).

Both sections emit `settings.update` audit events with `changedFields` listing what was modified (no values - secret-safe by construction).

## Auto-grab dry-run

The auto-grab job (`runAutoGrabForSeries`) fires releases to qBittorrent based on quality profiles + scoring. To preview decisions without firing, set dry-run mode at `/settings/auto-grab`.

| Mode    | Behaviour                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Live    | Calls `grabRelease` per decision; emits `auto_grab.grabbed` audit event per success.                                             |
| Dry-run | Skips `grabRelease` entirely; emits `auto_grab.dry_run_decision` audit event per decision. No qBT add, no failure notifications. |

Both audit events use `target: {kind: 'series', id}` and `metadata: {releaseId, reason, targets}`. View them at `/settings/audit` filtered by action.

Use dry-run when tuning quality profiles, scoring weights, or indexer config to see what the next live cycle would do before flipping back to live mode.

## Pinned advisories

Two medium-severity Dependabot advisories are blocked on upstream major-version releases. Documented here so future contributors don't re-investigate.

| Package   | Severity | Path                       | Blocked on                                                              |
| --------- | -------- | -------------------------- | ----------------------------------------------------------------------- |
| `postcss` | medium   | transitive via `next`      | Next.js 17 bumping its pinned postcss version.                          |
| `uuid`    | medium   | transitive via `node-cron` | `node-cron@4.x` stable release. The project pins `node-cron@3.x` today. |

Both are accepted risks. Re-evaluate when either dependency ships a major. To check status:

```bash
pnpm audit
```

## NovelUpdates integration

The Light Novel content type supplements its AniList primary metadata with NovelUpdates (https://www.novelupdates.com). NU provides:

- Comprehensive alternative-title list (merged into `extra_search_terms`).
- Country-of-Origin volume count (`totalVolumes`) when AniList is missing one.
- Author/illustrator credits.
- Chapter-release RSS feed for translated chapter tracking.

### Setup

When adding a Light Novel, paste the NU URL slug (e.g. `mushoku-tensei` from `novelupdates.com/series/mushoku-tensei/`) into the optional "NovelUpdates slug" field on the add sheet. The slug populates `series.novelUpdatesSlug`; the numeric series ID for the RSS endpoint is resolved on first hydrate and cached as `novelUpdatesId`.

### Jobs

- `novel_updates_hydrate` - runs after add (or on demand). Scrapes the NU series page and updates `novelUpdatesId`, `author` / `totalVolumes` (only when null - never overwrites AniList values), and merges aliases into `extra_search_terms`.
- `novel_updates_chapter_sync` - fetches the per-series RSS feed (`/extnu/<id>/`) and upserts chapters via the existing `upsertChapterByNumberSort` helper. Idempotent.

### Rate limits + ToS

NU has no public API - bookkeeprr scrapes its HTML pages. The client uses a 1-req-per-3-seconds token bucket and identifies itself via User-Agent. Both polite-bot conventions. NU's HTML structure can change; the parser returns `null` for missing fields rather than crashing.

### Future polish

- Live HTTP tests behind `RUN_LIVE_TESTS=1` (currently all NU tests are fixture-driven).
- Side-by-side AniList + NU search column in `LightNovelSearch` (the slug input on the sheet is available; the dual-source search UX is still a TODO).
- Periodic chapter-sync fanout (mirroring the `indexer-poll-fanout` pattern).
- Auto-resolving NU slug from AniList title matches.

## Matcher replay

After tweaking scoring weights or the adult filter on `/settings/matcher`, click **Run replay** on the Replay matcher card. Replay re-applies the current settings to historical releases (within the selected window), runs the same `decideGrabs` decision logic the live auto-grab path uses, and compares the new winners against what was actually downloaded.

### What "changed" means

- **Flipped** - the would-grab outcome flipped for a release: either a release that wasn't previously downloaded is now the per-target winner under new weights, OR a release that _was_ downloaded is no longer the winner. Only the former is adoptable; we never un-grab existing downloads.
- **Rescored** - the score changed by more than 5 points but the winner status didn't flip. Informational; surfaces "all my Erai-raws releases gained 30 points" without forcing adoption.

### Adopting decisions

On `/settings/matcher/replays/[runId]`, switch to the Flipped tab, tick adoptable rows (those marked "now grabs"), and click **Grab N selected**. Each row calls `grabRelease` directly. Per-row failures (qBittorrent down, release pruned by housekeeping, etc.) come back in the response's `failed[]` array and are surfaced in a toast.

### Snapshot semantics

When a replay starts, the current weights + adult-filter are frozen into the `replay_runs` row. If you edit settings mid-run, the in-flight replay still uses the snapshot - not the new values. Click Run replay again to compute against the updated settings. The snapshot is shown in an expandable disclosure on the run drill-down page, so the audit trail is permanent.

### Bounds

Replay only sees releases still present in the `releases` table - bounded by the active release retention policy. "All retained" means everything currently retained, not all-time history.

### Concurrency

Only one replay can be in flight at a time. POST to the replay endpoint returns 409 with the in-progress runId if you try to enqueue a second one. The UI's Run replay button is disabled while a run is active.

### Job kind

`release_match_replay` - manual-enqueue only (`drain: true`, no `enqueuePayload`), `maxAttempts: 1` (replay is expensive; retry is the user's choice via the UI), 30-minute timeout per attempt.

### Future polish

- Cancel-existing-download symmetry for "no longer grabs" rows (deferred - destructive action with sharp edges).

## Cleanup bundle 2

Closes the deferred-polish items from prior NovelUpdates and release_match_replay work.

### NovelUpdates polish

- **Periodic chapter-sync fanout.** A new cron entry runs every 6 hours and enqueues `novel_updates_chapter_sync` for every LN series with a `novelUpdatesId`. No user action needed - series stay current automatically.
- **Auto-resolved NU slug.** When adding a Light Novel, picking an AniList result fires `POST /api/integrations/novelupdates/resolve { title, altTitles }`. On high-confidence match (normalized-title exact or alias match, threshold 80) the slug field auto-fills and the confirmation strip below shows the matched NU title. On no-match the slug field stays empty with a "paste a slug manually" hint. The slug input remains the source of truth on submit.
- **Live HTTP tests.** `tests/server/integrations/novelupdates/live.test.ts` runs against real `novelupdates.com` when `RUN_LIVE_TESTS=1`. Three canary tests on `mushoku-tensei`: search, series-detail, RSS feed. Skipped by default. Establishes the live-tests precedent for AniList/ComicVine/OpenLibrary/Audnex later.

### Replay polish

- **Auto-replay on weight save.** A new "Auto-replay on save" toggle on the Replay matcher card (default off). When on, saving weights or the adult filter via the existing PATCH endpoints enqueues a 90-day replay if anything actually changed and no other run is in flight. PATCH response gains `autoReplayEnqueued?: {runId} | {error}`; `MatcherForm` surfaces a "Replay started - view results →" toast. Audit event `release_match_replay.auto_enqueued` distinct from manual `.enqueued`. Toggle endpoint: `PATCH /api/settings/matcher/auto-replay { enabled: boolean }`.
- **Per-series replay.** Series detail page (`/library/[id]`) gets an admin-only "Replay matcher for this series" button. POSTs `{ windowDays: 90, seriesId }` to the existing replay endpoint; the engine reads `run.seriesId` and iterates only that one series when set. The drill-down page shows a "Scope: <series>" chip linking back to the library page when a run was series-scoped.
- **`trusted`/`remake` persistence.** Two new nullable columns on `releases`. Nyaa's RSS already exposes both flags as item attributes; they are now persisted through `insertRelease`/`upsertReleaseByGuid`/`indexer-poll`. Replay engine reads stored values (`r.trusted ?? false`, `r.remake ?? false`) instead of synthesizing. Historical releases stay null; replay null-coalesces them to `false` - same behavior as before for historical releases.

### Migration 0014

Three nullable columns: `releases.trusted`, `releases.remake`, `replay_runs.series_id` (FK to `series.id` with `ON DELETE CASCADE`). Forward-only - no backfill of historical releases.

### Future polish

- Cancel-existing-download symmetry for "no longer grabs" replay decisions (still deferred).
- Live-test patterns for AniList / ComicVine / OpenLibrary / Audnex - copy the NU template.
- Auto-resolve NU slug for content types other than LN (not applicable today; NU is LN-only).

## Updates system

bookkeeprr checks GitHub Releases for `paulcsiki/bookkeeprr` once a day and surfaces results in three places: a version pill in the sidebar footer, a "What's new" dialog that auto-opens once per upgrade, and a `/settings/updates` admin panel. **bookkeeprr never self-installs in any deployment mode** - the panel shows the right command for your deployment so you can run it yourself.

### How it works

1. Daily cron `updates_check` at 03:17 UTC anonymously polls `https://api.github.com/repos/paulcsiki/bookkeeprr/releases`.
2. The top non-prerelease release is semver-compared against the running version (from `package.json`).
3. State persisted in the `updates.state` KV setting (latestVersion + URL + body + fetchedAt + fetchError).
4. `<VersionPill>` in the sidebar polls `/api/updates` every 60s; renders `vX.Y.Z ↑` badge when newer release is detected.
5. `<ChangelogDialog>` in the root layout auto-opens once after a real upgrade (`BUILD_INFO.version !== updates.last_seen_changelog_version`). Dismissal POSTs `/api/updates/changelog-seen`.

### Deployment-mode awareness

Detected at runtime:

- `$KUBERNETES_SERVICE_HOST` set → `kubernetes`.
- `/.dockerenv` exists → `docker`.
- Else → `unknown`.

Admins can override at `/settings/updates → Deployment mode`. The "How to install" copy on the update banner adapts:

- **Docker:** `docker compose pull && docker compose up -d`
- **Kubernetes:** "Update via your orchestrator (Helm, ArgoCD, kubectl set image, etc.). bookkeeprr does not self-install in Kubernetes."
- **Unknown:** "Update method depends on how you deployed bookkeeprr. Pull the new image and restart your container."

### Build info

Set at Docker build time via build args:

```bash
docker build \
  --build-arg BOOKKEEPRR_COMMIT="$(git rev-parse HEAD)" \
  --build-arg BOOKKEEPRR_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t bookkeeprr .
```

CI passes these automatically from `${{ github.sha }}` + a `date -u` computed in a workflow step. Local `pnpm dev` falls back to `'dev'`/`'local'` placeholders.

### Settings

- `updates.config` - `{enabled, notifyOnIntegrations, showChangelogOnFirstLaunch}`.
- `updates.state` - last poll snapshot.
- `updates.last_seen_changelog_version` - `{version}`, drives the auto-open changelog gate.
- `deployment.mode_override` - `{mode: 'auto' | 'docker' | 'kubernetes' | 'unknown'}`.

### Channels

Only the **stable** channel is selectable today. Beta and Nightly cards render disabled until CI publishes versioned release tags beyond `:latest`.

### Notifications

When `updates.config.notifyOnIntegrations` is on, a detected new release fires the notification pipeline with a new `update-available` event kind. Discord/Apprise routing is governed by the existing `eventUpdateAvailable` field in `notifications.config`.

### Future polish

- Markdown rendering of release bodies (currently plain text in `<pre>`). Needs `marked` + `dompurify` deps - held off pending a real need.
- Beta + Nightly channel support (requires CI to publish prerelease tags).
- Optional GitHub token in settings for higher rate limits (anonymous 60/hr is plenty for daily polls).
- In-app dashboard banner for non-admins so the changelog is more discoverable.
