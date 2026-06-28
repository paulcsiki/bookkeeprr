# Building bookkeeprr

Contributor guide. If you're running the app rather than working on it, see [deploy.md](./deploy.md).

## Prerequisites

| Tool        | Version    | Notes                                                                       |
| ----------- | ---------- | --------------------------------------------------------------------------- |
| Node.js     | ≥ 22       | `package.json` `engines.node`. Container uses `node:22-bookworm-slim`.      |
| pnpm        | 9.15.0     | Pinned via `packageManager`. **Never use `npm` or `yarn`** - see below.     |
| p7zip-full  | any modern | Only needed if you run the importer locally. CI installs it; container too. |
| sqlite3 CLI | optional   | Convenient for inspecting `bookkeeprr.dev.db` while developing.             |

> **pnpm is mandatory.** The Dockerfile, GitHub CI, and GitLab CI all use pnpm. Mixing package managers will corrupt the lockfile. If `pnpm` isn't on your PATH, enable corepack: `corepack enable && corepack prepare pnpm@9.15.0 --activate`.

## Getting started

```bash
git clone <your-fork-url>
cd bookkeeprr
pnpm install
pnpm dev
```

`pnpm dev` starts **two processes concurrently** via `concurrently`:

- `dev:web` - Next.js dev server with Turbopack on port 3000 (`next dev --turbo`)
- `dev:worker` - Job scheduler with auto-reload (`tsx watch src/worker.ts`)

The first request to a page will trigger Drizzle migrations against `./bookkeeprr.dev.db` (created if missing). Open [http://localhost:3000](http://localhost:3000) and you'll land on the first-run wizard.

## Scripts

| Script                  | What it does                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm dev`              | Web + worker, both reload on change.                                                        |
| `pnpm dev:web`          | Web only (handy if you're poking at the worker via the prod build).                         |
| `pnpm dev:worker`       | Worker only (TSX watch mode).                                                               |
| `pnpm build`            | `next build` then `pnpm build:worker`. Produces `.next/standalone/` + `dist/worker.cjs`.    |
| `pnpm build:worker`     | esbuild the worker to a single CJS bundle. Excludes `better-sqlite3` (resolved at runtime). |
| `pnpm start`            | Production web server (`next start`). Needs `pnpm build` first.                             |
| `pnpm start:worker`     | Production worker (`node dist/worker.cjs`).                                                 |
| `pnpm test`             | Full vitest suite (unit + integration). 690+ tests.                                         |
| `pnpm test:unit`        | Unit project only.                                                                          |
| `pnpm test:integration` | Integration project only (15-second per-test timeout).                                      |
| `pnpm test:watch`       | Vitest in watch mode.                                                                       |
| `pnpm typecheck`        | `tsc --noEmit`. Strict mode is on.                                                          |
| `pnpm lint`             | ESLint flat config. CI gate.                                                                |
| `pnpm format`           | Prettier write.                                                                             |
| `pnpm format:check`     | Prettier check. CI gate.                                                                    |
| `pnpm db:generate`      | `drizzle-kit generate`. Run after editing `src/server/db/schema.ts`.                        |
| `pnpm db:migrate`       | Apply pending migrations. The worker also runs this on startup.                             |

## Architecture map

```
src/
├── app/                    Next.js App Router
│   ├── (app)/              UI routes (library, add, settings, activity, ...)
│   ├── api/                32 HTTP endpoints - see docs/api.md
│   └── first-run/          Onboarding wizard
├── components/
│   ├── ui/                 shadcn UI primitives (do not edit by hand)
│   ├── add/                Per-content-type add sheets + search components
│   ├── library/            SeriesCard, SeriesList, etc.
│   └── shell/              Sidebar, TopBar, layout
├── server/                 Server-only modules - never imported by client components
│   ├── db/                 Drizzle schema, client, migrations runner, per-table DAL
│   ├── jobs/               Scheduler + 10 job kinds (see Job kinds below)
│   ├── integrations/       External API clients (AniList, ComicVine, qBT, ...)
│   ├── importer/           Archive extraction + content-type-aware file routing
│   ├── parser/             Filename parser (regex cascades for vol/chapter/group)
│   ├── scanner/            Disk walker + scan_matches workflow
│   ├── matcher/            Release ↔ series scoring (strict-granularity gate)
│   ├── naming/             Filename template engine ({token:formatter} DSL)
│   ├── content-type/       Five-content-type enum + per-type defaults
│   ├── grabber/            Send a release to qBittorrent
│   ├── auto-grab/          Decide which releases to grab; pure + impure split
│   ├── metadata/           Provider composer chains (e.g. OpenLibrary → GoogleBooks)
│   ├── notifications/      Discord + Apprise transports + dispatcher
│   ├── library-sync/       Audiobookshelf + Calibre rescan dispatcher
│   ├── config/             Env var parsing (Zod-validated)
│   ├── logger/             Pino setup
│   └── health/             Liveness signal for /api/health
├── lib/                    Shared utilities (dir-hash, etc.)
└── types/                  Ambient type declarations (e.g. bencode)
```

**Client/server boundary.** Modules under `src/server/` MUST NOT be imported by client components. Constants meant for both sides live in dedicated `*-defaults.ts` files that don't transitively pull in `node:path` or the DB client. The classic trap: importing `src/server/db/settings/naming.ts` from a client component breaks the Next.js build. If a client component needs naming keys, import from `src/server/naming/defaults.ts` instead.

## Database

SQLite via `better-sqlite3` with WAL mode. The schema is in `src/server/db/schema.ts` - 12 tables:

`settings` · `indexers` · `quality_profiles` · `series` · `volumes` · `chapters` · `releases` · `downloads` · `library_files` · `jobs` · `scan_matches` · (one more housekeeping table)

Migrations live in `drizzle/` (numbered 0000 onward). The worker process runs pending migrations on boot via `migrate()` in `src/server/db/migrate.ts`. To add a migration:

```bash
# 1. Edit src/server/db/schema.ts
# 2. Generate the migration SQL
pnpm db:generate
# 3. Review drizzle/0008_*.sql - drizzle-kit sometimes emits surprising statements
#    for table-rewrite cases (drop-not-null, adding UNIQUE on existing data, etc.)
# 4. Apply locally to test
pnpm db:migrate
```

**Write discipline.** All DAL writes wrap in `withWriteLock(async () => …)` (an async-mutex). Reads are lock-free - SQLite WAL allows concurrent readers. Inside a `db.transaction(...)` block (which is synchronous in better-sqlite3, not async!), pass `tx` to inner write logic - never call DAL helpers that take their own lock, you'll deadlock.

## Job system

`src/server/jobs/scheduler.ts` enqueues jobs via `node-cron`; `src/server/jobs/runner.ts` claims them atomically and dispatches to a handler per kind. Backoff is capped exponential.

| Job kind                | Schedule           | Purpose                                                         |
| ----------------------- | ------------------ | --------------------------------------------------------------- |
| `tick`                  | every minute       | Worker heartbeat for `/api/health`.                             |
| `library_scan`          | on-demand          | Walk a directory, populate `scan_matches`.                      |
| `metadata_hydrate`      | on-demand          | Pull volume/chapter metadata from AniList/etc.                  |
| `mangadex_chapter_sync` | on-demand          | Fill chapter list from MangaDex for manga series.               |
| `comicvine_hydrate`     | on-demand          | Pull issue list from ComicVine.                                 |
| `indexer-poll`          | every 15 minutes   | RSS-poll every enabled indexer; auto-grab matched releases.     |
| `missing_search`        | every 6 hours      | Forced search for missing volumes/chapters across all indexers. |
| `qbt_watch`             | every 2 minutes    | Poll qBittorrent for download progress; enqueue `import`.       |
| `import`                | on-demand          | Move completed downloads into the library; rename per template. |
| `housekeeping`          | daily at 03:00 UTC | Backup, purge old jobs, prune stale releases.                   |

The worker bundles via esbuild to **`dist/worker.cjs` (CommonJS)** - not ESM - because pino's internal `require()` calls break in ESM bundles. The bundle is ~734KB. `better-sqlite3` stays external (loaded from `node_modules` at runtime).

## Testing

```bash
pnpm test                  # full suite
pnpm test:unit             # unit only
pnpm test:integration      # integration only
pnpm test:watch            # watch mode
pnpm vitest run path/to/file.test.ts    # single file
```

**Layout:**

- `tests/server/` - most unit tests, mirrors `src/server/` structure
- `tests/integration/` - end-to-end-ish tests that spin up the real DB + mock external APIs
- `tests/fixtures/` - JSON fixtures for external APIs (mangadex, anilist, openlibrary, etc.)
- `tests/setup.ts` - global Vitest setup

**Vitest config** (`vitest.config.ts`):

- Two projects: `unit` and `integration`.
- Path alias `@/` → `src/`.
- Integration tests get a 15-second per-test timeout (some hit slow fixtures).

**Live external-API tests** are gated behind `RUN_LIVE_TESTS=1`. They're skipped by default in CI to avoid flakiness on third-party services.

**Writing tests:**

- Prefer fixture-driven tests over mocks for external APIs. Real-shape fixtures catch upstream regressions.
- Database integration tests use `seedDb()` from `tests/integration/helpers/seed.ts` - it spawns a temp SQLite file per test.
- The naming engine has its own test pattern: a table of `{ context, template, expected }` triples.

## Linting & formatting

- **ESLint flat config** at `eslint.config.mjs`. Uses `@eslint/js` + `typescript-eslint` + `@next/eslint-plugin-next`. Rules of note: `consistent-type-imports`, `no-useless-assignment` (ESLint 10 added this - watch for `let x = init; try { x = … } catch { x = init }` patterns).
- **Prettier** at `.prettierrc.json`: 100 cols, single quotes, semicolons, trailing commas, LF line endings.
- **No pre-commit hooks** - linting/formatting are CI gates. Run `pnpm format && pnpm lint && pnpm typecheck` before pushing.

## Design system

The design system is enforced via CSS variable tokens in `apps/web/src/app/globals.css`. Key rules for contributors:

**Rules:**

- **No inline color values** - no hex, no HSL, no OKLCH, no Tailwind palette colors (`bg-green-500` etc.). Always use CSS variables: `bg-[var(--color-ok)]`, `text-[var(--color-info)]`, etc.
- **Status semantics** are fixed: `--color-ok` (success/releasing), `--color-info` (neutral/finished), `--color-warn` (hiatus), `--color-err` (failure/cancelled).
- **Content-type colors** are fixed across themes: manga, comic, light_novel, ebook, audiobook each have a stable accent that doesn't retint when the user changes theme.
- **Themes** swap a single accent variable (`--color-primary`). Seven accents: Tsundoku, Kohaku, Sakura, Asagi, Sora, Moegi, Shiro. Implemented via `.theme-{hue}` body class.
- **Fonts:** Space Grotesk (display), Geist (sans), Geist Mono (mono).
- **Icons:** Lucide React.
- **shadcn UI** primitives live in `src/components/ui/`. Don't edit them by hand - re-add via `pnpm dlx shadcn add <component>` if you need a tweak.

## CI

Two CI pipelines run in parallel.

### GitHub Actions (`.github/workflows/ci.yml`)

Triggered on push to `main`, all PRs, and manual dispatch.

**`test` job** (15-min timeout):

1. Install p7zip-full.
2. `pnpm install --frozen-lockfile`.
3. `pnpm format:check`.
4. `pnpm lint`.
5. `pnpm typecheck`.
6. `pnpm test` with `BOOKKEEPRR_7Z_BIN=7z`.

**`image` job** (30-min timeout, runs only on main push if `test` passes):

- Builds and pushes `ghcr.io/paulcsiki/bookkeeprr:latest` to GitHub Container Registry.
- **Only `:latest` is published** - no per-commit, no per-sha tags. (Configured via `type=raw,value=latest` in `docker/metadata-action`.)

### GitLab CI (`.gitlab-ci.yml`)

Parallel jobs: `lint`, `test`, `build`, `image`, `publish`. Publishes to the self-hosted GitLab registry. Both CIs run for now; either can be dropped later.

## Development history

Tagged releases track significant stable points in the git history. The codebase supports five content types (manga, comic, light novel, ebook, audiobook), the Readarr-compatible API, multi-user auth, and a full E2E test suite. See `git log --oneline` for the commit history.

## Common gotchas

- **Importing `node:path` from a client component** breaks the build. Always check if a module's transitive imports include server-only code before using it in a client component.
- **Drizzle's better-sqlite3 transactions are synchronous.** `db.transaction((tx) => …)` returns `T`, not `Promise<T>`. No `await` inside the callback. Use `.all()`, `.run()`, etc.
- **The worker is a separate process.** When debugging job behavior, attach to `dev:worker` output, not the web log.
- **`BOOKKEEPRR_MEDIA_ROOT` defaults to `/media`**, NOT to your home directory. In dev, either set it to a writable path before starting or accept that the importer will fail.
- **Test isolation:** the integration suite mutates `BOOKKEEPRR_DB_PATH` per test via `seedDb()`. Don't run multiple `vitest watch` processes against the same DB.

## How to ship a change

1. Branch from `main`.
2. Make the change. Add tests. Keep commits small and named in active voice.
3. Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test` before pushing.
4. Push your branch; the GitHub workflow runs `test`. CI must be green before merging.
5. Merge to `main`. The `image` job builds and publishes `ghcr.io/paulcsiki/bookkeeprr:latest`.

No versioned release tags yet - every merge to `main` publishes `:latest`. Document significant changes in commit messages and PR descriptions.
