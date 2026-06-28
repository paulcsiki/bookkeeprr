# Deploying bookkeeprr

Operator guide. For day-to-day operations after deploy, see [maintain.md](./maintain.md).

## What you're deploying

bookkeeprr is a single-container application. The container runs **two processes** under `tini` as PID 1:

- **Web** (`node server.js`) - Next.js standalone server on port 3000.
- **Worker** (`node dist/worker.cjs`) - Job scheduler that polls indexers, drives qBittorrent, imports completed downloads.

Both processes share the same SQLite database file and the same media root. If either exits, `tini` sends SIGTERM to the other and the container exits - your orchestrator (systemd, docker-compose, k8s) restarts the whole thing.

## Quick start (docker run)

```bash
docker run -d \
  --name bookkeeprr \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /srv/bookkeeprr/config:/config \
  -v /srv/media:/media \
  ghcr.io/paulcsiki/bookkeeprr:latest
```

Then visit `http://<host>:3000` and complete the first-run wizard.

## docker-compose

```yaml
services:
  bookkeeprr:
    image: ghcr.io/paulcsiki/bookkeeprr:latest
    container_name: bookkeeprr
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      BOOKKEEPRR_LOG_LEVEL: info
      # Optional: pin user/group to match host file ownership
      # PUID: 1000
      # PGID: 1000
    volumes:
      - /srv/bookkeeprr/config:/config
      - /srv/media:/media
    healthcheck:
      test: ['CMD', 'wget', '-q', '--spider', 'http://localhost:3000/api/health']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

## Image

| Field        | Value                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| Registry     | `ghcr.io`                                                               |
| Repository   | `ghcr.io/paulcsiki/bookkeeprr`                                          |
| Tag          | `latest` (only tag published; pushes to `main` overwrite it in place)   |
| Base image   | `node:22-bookworm-slim`                                                 |
| Pinned tools | `tini` (PID 1), `p7zip-full` (importer auto-extract), `ca-certificates` |
| Architecture | Whatever GitHub's `ubuntu-latest` builds; currently `linux/amd64` only  |

There are no versioned tags. The project hasn't cut a 1.0 yet, so every `main` push overwrites `:latest`. Pin a sha-tagged digest if you need image immutability:

```bash
docker pull ghcr.io/paulcsiki/bookkeeprr:latest
docker inspect ghcr.io/paulcsiki/bookkeeprr:latest --format '{{.Id}}'
# Use sha256:... in your compose file under image:
```

## Environment variables

| Variable                  | Default                         | Notes                                                                   |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `BOOKKEEPRR_CONFIG_DIR`   | `/config`                       | DB, backups, runtime config. **Must be writable.**                      |
| `BOOKKEEPRR_DB_PATH`      | `${CONFIG_DIR}/bookkeeprr.db`   | Override only if you want the DB outside `/config`.                     |
| `BOOKKEEPRR_MEDIA_ROOT`   | `/media`                        | Parent of the per-type subdirs (`comics`, `books`, `audiobooks`, etc.). |
| `BOOKKEEPRR_PORT`         | `3000`                          | Web server port. Must be 1-65535.                                       |
| `BOOKKEEPRR_LOG_LEVEL`    | `info`                          | One of `fatal` / `error` / `warn` / `info` / `debug` / `trace`.         |
| `BOOKKEEPRR_7Z_BIN`       | `7z` (container) / `7zz` (host) | Path to the 7-zip binary. Debian ships `p7zip-full` as `7z`.            |
| `NODE_ENV`                | `production`                    | Set by the Dockerfile.                                                  |
| `NEXT_TELEMETRY_DISABLED` | `1`                             | Set by the Dockerfile.                                                  |

bookkeeprr has **no authentication.** There is no `BOOKKEEPRR_API_KEY` env var. Do not expose port 3000 directly to the public internet - see [Hardening](#hardening).

## Volumes

| Mount     | Purpose                                                                                           | Permissions      |
| --------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| `/config` | SQLite DB (`bookkeeprr.db` + WAL files), nightly backups (`backups/bookkeeprr-YYYY-MM-DD.db`).    | RW, ~hundred MB. |
| `/media`  | Your library. Subdirs: `comics/`, `books/`, `audiobooks/` (auto-created by the first-run wizard). | RW, large.       |

**Important:** if you bind-mount an existing media tree, make sure the user inside the container has write access to it. The container runs as root by default. If you set `PUID`/`PGID` via your orchestrator, those overrides happen outside the container - bookkeeprr itself doesn't handle drop-privileges.

## Media layout

bookkeeprr expects `BOOKKEEPRR_MEDIA_ROOT` to be the **parent** of per-type directories:

```
/media/
├── comics/       # manga, comics, light novels (currently colocated)
├── books/        # ebooks
└── audiobooks/   # audiobooks
```

Light novels currently go under `/media/comics/<series>/` - this matches the user's existing layout but isn't load-bearing. The per-type subdir map is in `src/server/content-type/paths.ts`.

> **Migrating from an older media layout?** If `BOOKKEEPRR_MEDIA_ROOT` previously pointed at `/media/comics` (the original manga-only layout), the entrypoint logs a warning at startup. Update the env var to the parent (`/media`) before the next deploy.

## Reverse proxy

bookkeeprr serves HTTP only - terminate TLS at your reverse proxy.

### Caddy

```caddy
bookkeeprr.example.com {
  reverse_proxy 127.0.0.1:3000
  encode gzip
}
```

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name bookkeeprr.example.com;

  ssl_certificate     /etc/letsencrypt/live/bookkeeprr.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/bookkeeprr.example.com/privkey.pem;

  client_max_body_size 100M;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP         $remote_addr;

    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }
}
```

### Traefik (labels)

```yaml
labels:
  - 'traefik.enable=true'
  - 'traefik.http.routers.bookkeeprr.rule=Host(`bookkeeprr.example.com`)'
  - 'traefik.http.routers.bookkeeprr.entrypoints=websecure'
  - 'traefik.http.routers.bookkeeprr.tls.certresolver=letsencrypt'
  - 'traefik.http.services.bookkeeprr.loadbalancer.server.port=3000'
```

## Hardening

bookkeeprr has no authentication. **Do not bind port 3000 to a public interface.** Three reasonable options:

1. **LAN-only access** - only the loopback or LAN binding. `-p 127.0.0.1:3000:3000` instead of `-p 3000:3000`.
2. **Reverse proxy + HTTP basic auth** - put the proxy in front, require basic auth, terminate TLS.
3. **VPN / Tailscale / WireGuard** - keep the service entirely off the public internet; access via VPN.

The Readarr-compatible API (`/api/readarr/v1/*`) uses `X-Api-Key` auth at the API layer. Until then, the reverse proxy is your only access-control surface.

Additional defenses worth considering:

- Run the container with `--read-only --tmpfs /tmp` if your filesystem layout allows it. The only writable paths bookkeeprr touches are `/config`, `/media`, and `/tmp` (for archive extraction).
- Drop capabilities: `--cap-drop=ALL --cap-add=DAC_OVERRIDE` (the last one is occasionally needed when the importer renames files across owners). Test in your environment.
- Set resource limits: `--memory=1g --cpus=2` is more than enough for a typical home library.
- Outbound network: bookkeeprr talks to AniList, ComicVine, MangaDex, OpenLibrary, Google Books, Audnex, Nyaa.si, and the indexers you configure. If you firewall outbound by host, allow those plus your qBittorrent + Calibre + Audiobookshelf endpoints.

## First-run wizard

The first request to bookkeeprr after a fresh install redirects to `/first-run`. It walks the operator through:

1. **Default quality profile** - preferred languages, scanlation groups (manga), size bounds.
2. **Media root sanity check** - verifies `BOOKKEEPRR_MEDIA_ROOT` is writable and auto-creates the per-type subdirs.

Once the wizard completes, it sets a flag in the `settings` table; the middleware then lets normal traffic through.

If you need to redo the wizard (e.g. a fresh database), wipe `settings.first_run_complete`:

```bash
sqlite3 /config/bookkeeprr.db "DELETE FROM settings WHERE key='first_run_complete';"
```

## Smoke-test checklist

After the container is running, verify the install:

```bash
# 1. Health endpoint
curl -s http://localhost:3000/api/health
# {"status":"healthy"}

# 2. First-run status
curl -s http://localhost:3000/api/first-run/status
# {"complete":false} on first boot

# 3. Migrations applied
sqlite3 /srv/bookkeeprr/config/bookkeeprr.db ".tables"
# settings indexers quality_profiles series volumes chapters ...

# 4. Worker heartbeat (look for "tick" in logs)
docker logs --tail 30 bookkeeprr | grep tick

# 5. Worker bundle present
docker exec bookkeeprr ls -l /app/dist/worker.cjs
# should be ~700KB

# 6. 7z binary
docker exec bookkeeprr 7z --help | head -3
# 7-Zip ... : Copyright ...
```

## Connecting qBittorrent

bookkeeprr expects a qBittorrent WebUI instance it can authenticate against. Configure it under **Settings → qBittorrent**:

| Field    | Value                                                                |
| -------- | -------------------------------------------------------------------- |
| Host     | qBittorrent's hostname or IP (reachable from bookkeeprr's container) |
| Port     | WebUI port (default 8080)                                            |
| Username | qBittorrent WebUI user                                               |
| Password | qBittorrent WebUI password                                           |
| HTTPS    | toggle if you've fronted qBT with TLS                                |

The "Test connection" button hits `/api/qbt/test-connection` - it logs in and pings the version endpoint without writing anything.

**Categories.** bookkeeprr uses qBT categories to track which torrents it owns. Each content type gets its own category (`bookkeeprr-manga`, `bookkeeprr-comic`, etc.). The categories are auto-created when first used; do not delete them in the qBT UI.

## Connecting indexers

One indexer is seeded by default:

- **Nyaa.si** - anime/manga torrents. Enabled by default. No credentials needed.

Add additional indexers (Torznab/Prowlarr, MAM, private trackers) under Settings - Indexers. Set per-indexer content-type allowlists to narrow scope.

## Logging

bookkeeprr uses pino (structured JSON). Logs go to stdout/stderr; let your container runtime collect them:

```bash
docker logs -f bookkeeprr
```

Set `BOOKKEEPRR_LOG_LEVEL=debug` to see verbose worker activity (job claims, indexer poll results, parser decisions). `trace` is even louder - useful for diagnosing a specific request but noisy for normal operation.

Each log line has at minimum:

```json
{ "level": 30, "time": "...", "app": "bookkeeprr", "component": "...", "msg": "..." }
```

`component` is the module that emitted the log (e.g. `metadata_hydrate`, `qbt_watch`, `importer`).

## Updating

```bash
docker pull ghcr.io/paulcsiki/bookkeeprr:latest
docker stop bookkeeprr && docker rm bookkeeprr
# re-run docker run / docker-compose up -d
```

Migrations apply automatically on boot (worker process). The first request after an update may take a few extra seconds while migrations finish - `/api/health` returns 503 until the heartbeat resumes.

## Troubleshooting deploy issues

| Symptom                                    | Likely cause                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Container exits immediately                | Migration failure - check stdout. Often a permissions issue on `/config`.                            |
| `/api/health` returns 503                  | Worker hasn't sent a heartbeat in 30s. Check worker logs for crashes.                                |
| First-run wizard fails on media-root step  | `/media` not writable inside the container, or the volume mount is read-only.                        |
| qBittorrent connection test fails with 401 | Re-enter credentials. qBT cookies expire - bookkeeprr handles this with a re-login retry.            |
| Imports stuck in "importing" status        | Worker not running, OR file is on a different filesystem than the qBT download dir. EXDEV → copy.    |
| "7z: command not found" in importer logs   | `BOOKKEEPRR_7Z_BIN=7zz` was set but Debian ships it as `7z`. Unset the env var or set to `7z`.       |
| GHCR pull denied                           | The image is public - re-check the registry path. `docker pull ghcr.io/paulcsiki/bookkeeprr:latest`. |
