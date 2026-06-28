import { z } from 'zod';
import { defineSetting } from '../settings';

export const ProwlarrConnectionSchema = z.object({ url: z.string(), apiKey: z.string() });
export type ProwlarrConnection = z.infer<typeof ProwlarrConnectionSchema>;

const DEFAULT: ProwlarrConnection = { url: '', apiKey: '' };

export const prowlarrConnectionSetting = defineSetting('prowlarr.connection', ProwlarrConnectionSchema, DEFAULT);

export function isProwlarrConfigured(c: ProwlarrConnection): boolean {
  return c.url.length > 0 && c.apiKey.length > 0;
}
