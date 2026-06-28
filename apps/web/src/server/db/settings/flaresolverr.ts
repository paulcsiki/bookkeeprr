import type { z } from 'zod';
import { FlaresolverrSchema } from '@/server/openapi/schemas/settings';
import { defineSetting } from '../settings';

// Single-sourced in the OpenAPI schema module (also the PUT /api/settings/flaresolverr body).
export { FlaresolverrSchema };

export type FlaresolverrConfig = z.infer<typeof FlaresolverrSchema>;

const DEFAULT: FlaresolverrConfig = {
  url: '',
};

export const flaresolverrSetting = defineSetting('flaresolverr', FlaresolverrSchema, DEFAULT);

export function isFlaresolverrConfigured(c: FlaresolverrConfig): boolean {
  return c.url.trim().length > 0;
}
