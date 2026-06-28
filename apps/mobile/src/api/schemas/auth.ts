import { z } from 'zod';

export const ExchangeRequest = z.object({ exchange_code: z.string() });
export const ExchangeResponse = z.object({
  token: z.string(),
  refresh_token: z.string(),
  expires_at: z.string(),
});
export type ExchangeResponse = z.infer<typeof ExchangeResponse>;
