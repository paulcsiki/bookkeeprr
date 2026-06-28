import { z } from 'zod';

const Person = z.object({
  name: z.string(),
  asin: z.string().optional(),
});

export const AudnexBook = z.object({
  asin: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  authors: z.array(Person).optional(),
  narrators: z.array(Person).optional(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  runtimeLengthMin: z.number().int().nullable().optional(),
  publisherName: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
});

export const AudnexSearchResponse = z.array(AudnexBook);
export type AudnexBookT = z.infer<typeof AudnexBook>;
