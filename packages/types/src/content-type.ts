import { z } from 'zod';
import {
  CONTENT_TYPES,
  type ContentType,
  isContentType,
  assertContentType,
} from './content-type-pure';

export { CONTENT_TYPES, type ContentType, isContentType, assertContentType };

/**
 * Zod schema for ContentType. Prefer importing directly from
 * '@bookkeeprr/types' in server/API code. For CLI scripts or DB modules that
 * must not bundle zod, import from the pure sub-path instead.
 */
export const ContentTypeSchema = z.enum(CONTENT_TYPES);
