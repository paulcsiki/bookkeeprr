import type { z } from 'zod';
import { QbtConnectionSchema } from '@/server/openapi/schemas/settings';
import { defineSetting } from '../settings';

// Single-sourced in the OpenAPI schema module (also the PUT /api/settings/qbt body).
export { QbtConnectionSchema };

export type QbtConnection = z.infer<typeof QbtConnectionSchema>;

const DEFAULT: QbtConnection = {
  host: '',
  port: 8080,
  username: '',
  password: '',
  useHttps: false,
};

export const qbtConnectionSetting = defineSetting('qbt.connection', QbtConnectionSchema, DEFAULT);

export function isQbtConfigured(c: QbtConnection): boolean {
  return c.host.length > 0 && c.username.length > 0;
}
