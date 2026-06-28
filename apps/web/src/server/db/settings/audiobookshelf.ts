import { z } from 'zod';
import { defineSetting } from '../settings';
import { CONTENT_TYPES } from '@/server/content-type';

export const AudiobookshelfSchema = z.object({
  baseUrl: z.string().nullable(),
  apiToken: z.string().nullable(),
  libraryId: z.string().nullable(),
  contentTypes: z.array(z.enum(CONTENT_TYPES)),
  enabled: z.boolean(),
});

export type AudiobookshelfConfig = z.infer<typeof AudiobookshelfSchema>;

const DEFAULT: AudiobookshelfConfig = {
  baseUrl: null,
  apiToken: null,
  libraryId: null,
  contentTypes: ['audiobook'],
  enabled: false,
};

export const audiobookshelfSetting = defineSetting('audiobookshelf', AudiobookshelfSchema, DEFAULT);

export function isAudiobookshelfConfigured(cfg: AudiobookshelfConfig): boolean {
  return (
    cfg.enabled &&
    cfg.baseUrl !== null &&
    cfg.baseUrl.length > 0 &&
    cfg.apiToken !== null &&
    cfg.apiToken.length > 0 &&
    cfg.libraryId !== null &&
    cfg.libraryId.length > 0
  );
}
