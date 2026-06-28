// Source of truth: @bookkeeprr/types. This file exists for back-compat with
// the existing `@/server/content-type` import sites. Prefer importing
// directly from '@bookkeeprr/types' in new code.
//
// Imports from the pure (no-zod) sub-path so that esbuild standalone bundles
// (dist/worker.cjs, dist/reset-user-password.cjs) do not pull in zod via
// the DB schema → content-type → types transitive chain.
// ContentTypeSchema is available directly from '@bookkeeprr/types' for code
// that needs it.
export {
  CONTENT_TYPES,
  isContentType,
  assertContentType,
  type ContentType,
} from '@bookkeeprr/types/pure';
