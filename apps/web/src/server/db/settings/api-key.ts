import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { defineSetting } from '../settings';

export const ApiKeySchema = z.object({
  key: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export type ApiKeyConfig = z.infer<typeof ApiKeySchema>;

const DEFAULT: ApiKeyConfig = { key: null, createdAt: null };

export const apiKeySetting = defineSetting('api-key', ApiKeySchema, DEFAULT);

export function isApiKeyEnabled(cfg: ApiKeyConfig): boolean {
  return cfg.key !== null && cfg.key.length > 0;
}

export function generateApiKey(): string {
  return randomBytes(32).toString('base64url');
}
