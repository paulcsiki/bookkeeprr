import { z } from 'zod';
import { AUTH_MODES, type AuthMode, USER_SOURCES, type UserSource } from './auth-pure';

export { AUTH_MODES, type AuthMode, USER_SOURCES, type UserSource };

/** Zod schemas for the shared auth enums. Import the const arrays from
 *  '@bookkeeprr/types/pure' instead in modules that must not bundle zod. */
export const AuthModeSchema = z.enum(AUTH_MODES);
export const UserSourceSchema = z.enum(USER_SOURCES);
