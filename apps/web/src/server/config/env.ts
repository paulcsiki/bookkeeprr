import { z } from 'zod';

const EnvSchema = z.object({
  BOOKKEEPRR_CONFIG_DIR: z.string().min(1).default('/config'),
  BOOKKEEPRR_MEDIA_ROOT: z.string().min(1).default('/media'),
  BOOKKEEPRR_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BOOKKEEPRR_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  BOOKKEEPRR_DB_PATH: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return EnvSchema.parse(source);
}

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}
