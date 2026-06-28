import { apiKeySetting, isApiKeyEnabled } from '@/server/db/settings/api-key';

export type ValidateApiKeyResult = 'ok-key-set' | 'ok-no-key-set' | 'unauthorized';

export async function validateApiKey(req: Request): Promise<ValidateApiKeyResult> {
  const cfg = await apiKeySetting.get();
  if (!isApiKeyEnabled(cfg)) return 'ok-no-key-set';
  const provided = req.headers.get('x-api-key');
  if (provided === cfg.key) return 'ok-key-set';
  return 'unauthorized';
}

export function readarrError(status: number, message: string, description?: string): Response {
  const body = description ? { message, description } : { message };
  return Response.json(body, { status });
}
