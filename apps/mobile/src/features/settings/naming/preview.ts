// Pure, offline naming preview — a faithful port of the web NamingForm's
// `previewFor` (apps/web/src/app/(app)/settings/naming/NamingForm.tsx). It maps
// a naming key to the engine's template "kind", validates, then renders against
// the exact same fixture context the web uses (the "Chainsaw Man v14 c142"
// release) so the live preview matches the server byte-for-byte.
import {
  render,
  validateTemplate,
  type NamingContext,
  type NamingKey,
  type TemplateContentType,
} from '@bookkeeprr/logic';
import type { ContentType } from '@bookkeeprr/types/pure';

// NamingKey → engine template-kind. Copied verbatim from the web form so the
// validation rules (forbidden tokens per kind) line up.
const CONTENT_TYPE: Record<NamingKey, TemplateContentType> = {
  series_folder: 'folder',
  volume_subfolder: 'folder',
  volume: 'volume',
  chapter: 'chapter',
  batch: 'batch',
};

// The fixture context — copied verbatim from the web form. The per-key `target`
// is narrowed below so each kind only renders the token it's allowed to use.
const FIXTURE: NamingContext = {
  series: { english: 'Chainsaw Man', romaji: 'Chainsaw Man', anilistId: 105778, year: 2018 },
  release: { group: 'LH', language: 'en' },
  target: { volume: 14, chapter: '142', chapterRange: '001-012' },
  source: { ext: 'cbz' },
};

export type PreviewResult =
  | { ok: true; preview: string }
  | { ok: false; error: string };

// `contentType` (the media type the user is editing) is accepted for parity
// with the web form and future per-type fixtures, but the engine kind is driven
// by the naming key — matching the web behavior exactly.
export function previewFor(
  key: NamingKey,
  template: string,
  _contentType: ContentType,
): PreviewResult {
  const v = validateTemplate(template, CONTENT_TYPE[key]);
  if (!v.ok) return { ok: false, error: v.error };
  try {
    const ctx: NamingContext = {
      ...FIXTURE,
      target:
        key === 'volume'
          ? { volume: 14 }
          : key === 'chapter'
            ? { chapter: '142' }
            : key === 'batch'
              ? { chapterRange: '001-012' }
              : {},
    };
    return { ok: true, preview: render(template, ctx) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
