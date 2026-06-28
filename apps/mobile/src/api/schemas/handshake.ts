import { z } from 'zod';
import { AUTH_MODES } from '@bookkeeprr/types';

// Single source of truth, shared with the server (packages/types).
export const AuthMode = z.enum(AUTH_MODES);
export type AuthMode = z.infer<typeof AuthMode>;

export const HandshakeResponse = z.object({
  server_version: z.string(),
  supported_auth_modes: z.array(AuthMode).min(1),
  brand: z.string(),
  push_enabled: z.boolean().default(false),
});
export type HandshakeResponse = z.infer<typeof HandshakeResponse>;
