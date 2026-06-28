import { z } from 'zod';
import { registry } from './registry';
import { ErrorResponse } from './schemas/common';
import type { OperationDef } from './types';
import pkg from '../../../package.json';

const STATUS_TEXT: Record<string, string> = {
  '200': 'Success',
  '201': 'Created',
  '202': 'Accepted',
  '204': 'No content',
  '400': 'Bad request',
  '401': 'Unauthorized',
  '404': 'Not found',
  '409': 'Conflict',
  '422': 'Unprocessable entity',
  '502': 'Upstream service failure',
  '503': 'Required service not configured',
};

/**
 * zod's toJSONSchema stamps every int() with ±Number.MAX_SAFE_INTEGER bounds.
 * They're implementation noise, and doc viewers surface them (constraint
 * chips, `-9007199254740991` example values). Drop them; keep real bounds.
 */
function stripSafeIntBounds(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(stripSafeIntBounds);
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of ['minimum', 'exclusiveMinimum'] as const) {
      if (obj[key] === -Number.MAX_SAFE_INTEGER) delete obj[key];
    }
    for (const key of ['maximum', 'exclusiveMaximum'] as const) {
      if (obj[key] === Number.MAX_SAFE_INTEGER) delete obj[key];
    }
    Object.values(obj).forEach(stripSafeIntBounds);
  }
}

function toSchema(s: z.ZodType, io: 'input' | 'output'): unknown {
  const result = z.toJSONSchema(s, { io, unrepresentable: 'any' }) as Record<string, unknown>;
  // Schema Objects embedded in an OpenAPI document must not carry $schema.
  delete result.$schema;
  stripSafeIntBounds(result);
  return result;
}

function pathParams(op: { path: string; params?: Record<string, z.ZodType> }): unknown[] {
  const names = [...op.path.matchAll(/\{([^}]+)\}/g)].flatMap((m) =>
    m[1] !== undefined ? [m[1]] : [],
  );
  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema:
      op.params?.[name] !== undefined
        ? toSchema(op.params[name], 'input')
        : { type: 'string' },
  }));
}

function queryParams(query: z.ZodObject<z.ZodRawShape>): unknown[] {
  return Object.entries(query.shape).map(([name, field]) => ({
    name,
    in: 'query',
    required: !(field as z.ZodType).safeParse(undefined).success,
    schema: toSchema(field as z.ZodType, 'input'),
  }));
}

export function generateOpenApiDoc(ops: OperationDef[] = registry): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of ops) {
    const item = (paths[op.path] ??= {});
    if (item[op.method] !== undefined) {
      throw new Error(`Duplicate operation: ${op.method.toUpperCase()} ${op.path}`);
    }
    if (Object.keys(op.responses).length === 0) {
      throw new Error(`No responses declared: ${op.method.toUpperCase()} ${op.path}`);
    }
    if (op.open === true && op.security !== undefined) {
      throw new Error(
        `open and security are mutually exclusive: ${op.method.toUpperCase()} ${op.path}`,
      );
    }
    item[op.method] = {
      tags: [op.tag],
      summary: op.summary,
      ...(op.description ? { description: op.description } : {}),
      ...(op.open === true ? { security: [] } : {}),
      ...(op.security === 'bearer' ? { security: [{ bearerAuth: [] }] } : {}),
      parameters: [...pathParams(op), ...(op.query ? queryParams(op.query) : [])],
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: toSchema(op.body, 'input') } },
            },
          }
        : {}),
      responses: Object.fromEntries(
        Object.entries(op.responses).map(([code, schema]) => [
          code,
          schema === null
            ? { description: STATUS_TEXT[code] ?? '' }
            : {
                description: STATUS_TEXT[code] ?? '',
                content: { 'application/json': { schema: toSchema(schema, 'output') } },
              },
        ]),
      ),
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'bookkeeprr API',
      version: (pkg as { version?: string }).version ?? '0.0.0',
      description: [
        'Native REST API plus the Readarr-compatible adapter (`/api/readarr/v1/*`),',
        'which maps bookkeeprr resources to Readarr shapes for compat clients.',
        '',
        '## Authentication',
        '',
        'Send **any one** of the supported credentials — they are alternatives, not',
        'requirements. Both work on the native surface **and** on the',
        'Readarr-compatible surface:',
        '',
        '- **Bearer token** — a personal API key (`Authorization: Bearer bkr_…`),',
        '  created under **Account → API keys**. Acts as the owning user. The',
        '  recommended mode for scripts and API clients.',
        '- **`X-Api-Key` header** — the static system key, generated under',
        '  **Settings → API Access**. The conventional mode for Readarr-compat',
        '  clients (Calibre-Web etc.), which usually only know how to send',
        '  `X-Api-Key`.',
        '',
        'Requests without a valid credential get **401**. `/api/health`,',
        '`/api/first-run/*`, and `/api/auth/*` stay open.',
        '',
        '## Conventions',
        '',
        '- Responses are always JSON; send `Content-Type: application/json` on writes.',
        '- Errors return `{"error": "human message"}`, sometimes with `detail`',
        '  (underlying error) or `hint` (recovery suggestion). The Readarr-compatible',
        '  surface uses Readarr\'s own envelope instead: `{"message", "description?"}`.',
        '- Status codes: `200` success · `201` created · `202` long-running job',
        '  enqueued · `204` no content (deletes) · `400` malformed body or id ·',
        '  `404` not found · `409` conflict (duplicate, already grabbed, job in',
        '  progress) · `422` referenced row does not exist · `502` upstream service',
        '  failure · `503` required service not configured.',
        '- Settings endpoints never return stored secrets — reads are masked',
        '  (`"****"` or `"••••••••"`), and writing the mask or an empty string keeps',
        '  the stored value. Per-field semantics are documented on each schema.',
      ].join('\n'),
    },
    // The doc is also published on the marketing site, where a relative URL
    // would wrongly resolve against the doc host — use an example domain as
    // the fallback there. The app's own route replaces this with the real
    // request origin.
    servers: [
      {
        url: 'https://bookkeeprr.domain.com',
        description: 'Your self-hosted bookkeeprr instance — substitute your own host.',
      },
    ],
    // Public-API auth modes only. The bundled UI's session cookie also
    // authenticates /api/* but is an internal detail — not documented here.
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    tags: [...new Set(ops.map((op) => op.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Personal API key (`Authorization: Bearer bkr_…`) created under ' +
            'Account → API keys. Either this or `X-Api-Key` is sufficient — ' +
            'send one, not both. Mobile app tokens issued by the mobile ' +
            'onboarding exchange use the same header.',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
          description:
            'Static API key generated under Settings → API Access. Either this ' +
            'or the bearer token is sufficient — send one, not both. The ' +
            'conventional mode for Readarr-compat clients.',
        },
      },
      schemas: { Error: toSchema(ErrorResponse, 'output') },
    },
  };
}
