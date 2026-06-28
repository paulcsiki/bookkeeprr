// The pure naming engine now lives in `@bookkeeprr/logic` (RN-safe, shared with
// mobile for offline naming preview). This module re-exports it verbatim so the
// existing `@/server/naming/engine` surface is unchanged for web importers.
export {
  render,
  validateTemplate,
  NamingError,
  type NamingContext,
  type ValidateResult,
  // engine-level template kind ('volume' | 'chapter' | 'batch' | 'folder');
  // exported from the logic package root as `TemplateContentType`.
  type TemplateContentType as ContentType,
} from '@bookkeeprr/logic';
