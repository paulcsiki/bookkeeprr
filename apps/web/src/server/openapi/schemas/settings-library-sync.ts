import { z } from 'zod';
import { ContentTypeEnum } from './series';

// ─────────────────────────────────────────────────────────────────────────────
// Library-sync settings (Audiobookshelf / Calibre) — request schemas are the
// single source of truth, used BOTH for runtime validation in the route
// handlers (app/api/settings/library-sync/**) and for the generated OpenAPI
// spec. Masked-secret idiom for this family: GET masks the secret to
// "••••••••" (null when unset); on PATCH, "" keeps the stored value and null
// clears it — and the SAME ""-keeps semantics apply to the non-secret
// nullable fields (baseUrl, libraryId, username).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Audiobookshelf ──────────────────────────────────────────────────────────

/** PATCH /api/settings/library-sync/audiobookshelf body. */
export const AudiobookshelfPatchBody = z.object({
  baseUrl: z.string().nullable().describe('"" keeps the stored value; null clears it.'),
  apiToken: z
    .string()
    .nullable()
    .describe('Masked to "••••••••" on GET. "" keeps the stored token; null clears it.'),
  libraryId: z.string().nullable().describe('"" keeps the stored value; null clears it.'),
  contentTypes: z.array(ContentTypeEnum),
  enabled: z.boolean(),
});

/** GET /api/settings/library-sync/audiobookshelf 200. */
export const AudiobookshelfGetResponse = z.object({
  baseUrl: z.string().nullable(),
  apiToken: z
    .string()
    .nullable()
    .describe('"••••••••" when a token is stored, null otherwise (never the real token).'),
  libraryId: z.string().nullable(),
  contentTypes: z.array(ContentTypeEnum),
  enabled: z.boolean(),
  configured: z.boolean(),
});

/** GET /api/settings/library-sync/audiobookshelf/libraries 200. */
export const AudiobookshelfLibrariesResponse = z.object({
  libraries: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mediaType: z.string().describe('"book" or "podcast".'),
    }),
  ),
});

// ─── Calibre ─────────────────────────────────────────────────────────────────

/** PATCH /api/settings/library-sync/calibre body. */
export const CalibrePatchBody = z.object({
  baseUrl: z.string().nullable().describe('"" keeps the stored value; null clears it.'),
  username: z.string().nullable().describe('"" keeps the stored value; null clears it.'),
  password: z
    .string()
    .nullable()
    .describe('Masked to "••••••••" on GET. "" keeps the stored password; null clears it.'),
  libraryId: z.string(),
  contentTypes: z.array(ContentTypeEnum),
  enabled: z.boolean(),
});

/** GET /api/settings/library-sync/calibre 200. */
export const CalibreGetResponse = z.object({
  baseUrl: z.string().nullable(),
  username: z.string().nullable(),
  password: z
    .string()
    .nullable()
    .describe('"••••••••" when a password is stored, null otherwise (never the real password).'),
  libraryId: z.string(),
  contentTypes: z.array(ContentTypeEnum),
  enabled: z.boolean(),
  configured: z.boolean(),
});
