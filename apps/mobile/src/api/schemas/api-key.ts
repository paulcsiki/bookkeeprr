import { z } from 'zod';

export const ApiKeyState = z.object({
  enabled: z.boolean(),
  key: z.string(),
  createdAt: z.string().nullable(),
});
export type ApiKeyState = z.infer<typeof ApiKeyState>;

export const ApiKeyTestResult = z.object({
  ok: z.boolean(),
  note: z.string().optional(),
  error: z.string().optional(),
});
export type ApiKeyTestResult = z.infer<typeof ApiKeyTestResult>;
