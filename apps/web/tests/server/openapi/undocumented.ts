export interface UndocumentedEntry {
  /** Exact OpenAPI-style path, or a prefix glob ending in `/**`. */
  path: string;
  /** Why this surface is not in the public spec. */
  reason: string;
}

export const UNDOCUMENTED: UndocumentedEntry[] = [
  // ─── Permanently internal ────────────────────────────────────────────────────
  // Mobile BFF: app-internal contract between the React Native client and the
  // server. These endpoints are not part of the public REST API.
  {
    path: '/api/mobile/**',
    reason: 'mobile BFF — app-internal contract, not part of the public spec',
  },
  // Image proxy/cache used by the bundled web UI. Not a public API surface.
  {
    path: '/api/img/**',
    reason: 'image proxy/cache for the bundled UI — internal, not part of the public spec',
  },

  // ─── Series subroutes that stay internal (the rest of /api/series is in the
  //     registry) ─────────────────────────────────────────────────────────────
  {
    path: '/api/series/{id}/chapters/{chapterId}/read',
    reason:
      'per-user chapter read toggle for the web/mobile reader UI — session-gated, not part of the curated public surface',
  },
  {
    path: '/api/series/{id}/hydration-status',
    reason:
      'series-page activity-indicator polling endpoint (UI-internal metadata plumbing, not part of the curated public surface)',
  },
  {
    path: '/api/series/{id}/refresh-metadata',
    reason:
      'admin UI button that re-enqueues hydrate jobs (UI-internal metadata plumbing, not part of the curated public surface)',
  },
  {
    path: '/api/series/{id}/rename',
    reason:
      'admin UI rename-preview/apply plumbing for the naming engine (UI-internal, not part of the curated public surface)',
  },
  {
    path: '/api/series/{id}/toc',
    reason:
      'reader table-of-contents plumbing for the present readable file — session-gated, not part of the curated public surface',
  },
  {
    path: '/api/series/{id}/volumes',
    reason:
      'admin UI manual volume range add/list (UI-internal metadata plumbing, not part of the curated public surface)',
  },

  // ─── Settings subroutes that stay internal (the rest of /api/settings is in
  //     the registry) ──────────────────────────────────────────────────────────
  {
    path: '/api/settings/cloud/**',
    reason:
      'cloud push opt-in handshake (status/terms/connect/disconnect) for the bundled UI — the shapes are owned by the bookkeeprr-cloud service contract, not the public surface',
  },
  {
    path: '/api/settings/deployment-mode',
    reason:
      'admin UI override for deployment-mode detection feeding the in-UI update instructions — UI-internal plumbing, not part of the curated public surface',
  },
  {
    path: '/api/settings/matcher/replays/**',
    reason:
      'matcher replay diagnostics workbench (run/list/inspect/adopt replay runs) — admin UI tuning plumbing, not part of the curated public surface',
  },

  // ─── Auth subroutes that stay internal (the rest of /api/auth is in the
  //     registry) ─────────────────────────────────────────────────────────────
  {
    path: '/api/auth/oidc/start',
    reason:
      'browser-redirect SSO flow (kicks the authorization-code redirect with PKCE/state cookies) — not a JSON API',
  },
  {
    path: '/api/auth/oidc/callback',
    reason:
      'browser-redirect SSO flow (IdP redirect target; consumes the state cookie and 302s into the app) — not a JSON API',
  },
  {
    path: '/api/auth/forward-auth/validate',
    reason:
      'reverse-proxy internal: probe endpoint the admin UI uses to validate proxy headers during forward-auth setup — not part of the curated public surface',
  },
  {
    path: '/api/auth/me/avatar',
    reason: 'avatar upload/delete — multipart form upload, out of JSON-spec scope',
  },
  {
    path: '/api/auth/me/avatar/{userId}',
    reason: 'serves the avatar image bytes for the UI — binary response, not a JSON API',
  },

  // ─── First-run subroutes that stay internal (status/complete are in the
  //     registry) ─────────────────────────────────────────────────────────────
  {
    path: '/api/first-run/check-paths',
    reason:
      'first-run wizard plumbing: probes host config/media paths for writability (absolute host paths) — UI-internal, not part of the curated public surface',
  },
  {
    path: '/api/first-run/media-root',
    reason:
      'first-run wizard plumbing: persists the media-root choice before any user exists — UI-internal, not part of the curated public surface',
  },

  // ─── UI-internal families (final triage, 2026-06-10) ─────────────────────────
  // /api/calendar was the one family promoted to the registry in this triage —
  // a stable, script-friendly JSON feed. Everything below serves the bundled
  // web/mobile UI and tracks that UI's needs, not a public contract.
  {
    path: '/api/audit/**',
    reason:
      'admin diagnostics for /settings/audit and /settings/logs (paged audit-event query + rotated-log-file listing/tailing; payloads carry raw log lines and absolute host paths) — not part of the curated public surface',
  },
  {
    path: '/api/dashboard/**',
    reason:
      'dashboard BFF for the web/mobile Home screen (server-assembled aggregate of feed/goals/leaderboard/continue-reading, plus per-user widget prefs) — the shape tracks the dashboard UI, not a stable public contract',
  },
  {
    path: '/api/discover/**',
    reason:
      'discover UI plumbing (search/browse/category/detail/resolve-audiobook) over third-party metadata providers — response shapes mirror provider payloads (AniList/MangaDex/ComicVine/OpenLibrary/Audnex/NYT/LibriVox) and change with the discover UI',
  },
  {
    path: '/api/integrations/**',
    reason:
      'NovelUpdates slug resolver used by the add-series admin flow — depends on an upstream scraper (Byparr/FlareSolverr) and degrades to no-match; UI-internal, not part of the curated public surface',
  },
  {
    path: '/api/profile/**',
    reason:
      'household-member profile dossier consumed by the web/mobile profile screens — session-gated per-user UI payload, not part of the curated public surface',
  },
  {
    path: '/api/reader/**',
    reason:
      'in-app reader surface: manifests, binary page/audio/EPUB-resource streams, per-user progress/goals/stats heartbeats — session-gated reader plumbing whose contract is owned by @bookkeeprr/types, not the public spec',
  },
  {
    path: '/api/updates/**',
    reason:
      'in-app update checker for the bundled UI (GitHub releases proxy, rate-limited check trigger, per-user changelog-seen marker) — admin UI plumbing, not part of the curated public surface',
  },
];
