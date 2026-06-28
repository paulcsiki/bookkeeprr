import { z } from 'zod';
import { defineSetting } from '../settings';
import { CONTENT_TYPES } from '@/server/content-type';

export const CalibreSchema = z.object({
  baseUrl: z.string().nullable(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  libraryId: z.string(),
  contentTypes: z.array(z.enum(CONTENT_TYPES)),
  enabled: z.boolean(),
});

export type CalibreConfig = z.infer<typeof CalibreSchema>;

const DEFAULT: CalibreConfig = {
  baseUrl: null,
  username: null,
  password: null,
  libraryId: '0',
  contentTypes: ['ebook'],
  enabled: false,
};

export const calibreSetting = defineSetting('calibre', CalibreSchema, DEFAULT);

export function isCalibreConfigured(cfg: CalibreConfig): boolean {
  return cfg.enabled && cfg.baseUrl !== null && cfg.baseUrl.length > 0;
}
