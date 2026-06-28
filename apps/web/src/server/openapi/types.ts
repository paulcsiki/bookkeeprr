import type { z } from 'zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface OperationDef {
  method: HttpMethod;
  /** OpenAPI path syntax, e.g. `/api/series/{id}`. */
  path: string;
  /** Sidebar group in the viewer. Native families use the resource name
   *  ("Series", "Settings"); the compat surface uses "Readarr compat". */
  tag: string;
  summary: string;
  description?: string;
  /** Path-param schemas keyed by name; params present in `path` but not
   *  listed here default to a string schema. */
  params?: Record<string, z.ZodType>;
  /** Query-string schema. Each top-level key becomes a query parameter;
   *  optionality is derived from the field schema. */
  query?: z.ZodObject<z.ZodRawShape>;
  /** JSON request body. */
  body?: z.ZodType;
  /** Response body schema per status code; `null` = empty body (e.g. 204). */
  responses: Record<number, z.ZodType | null>;
  /** Publicly reachable without credentials (login, health, first-run…):
   *  emits `security: []` on the operation, overriding the global default. */
  open?: boolean;
  /** Per-op auth-scheme override. `'bearer'` = mobile-API-token only
   *  (`Authorization: Bearer …`); emits `security: [{ bearerAuth: [] }]`.
   *  Mutually exclusive with `open`. */
  security?: 'bearer';
}
