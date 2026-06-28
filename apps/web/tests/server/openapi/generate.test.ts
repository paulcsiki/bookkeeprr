import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { generateOpenApiDoc } from '@/server/openapi/generate';
import { registry } from '@/server/openapi/registry';
import type { OperationDef } from '@/server/openapi/types';
import { ErrorResponse } from '@/server/openapi/schemas/common';

type Doc = ReturnType<typeof generateOpenApiDoc>;

/** Collect every `$ref` string anywhere in the doc. */
function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, refs));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') refs.push(v);
      else collectRefs(v, refs);
    }
  }
  return refs;
}

describe('generateOpenApiDoc', () => {
  const doc = generateOpenApiDoc() as Doc & {
    openapi: string;
    info: { title: string; version: string };
    paths: Record<string, Record<string, unknown>>;
    components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
  };

  it('declares OpenAPI 3.1 with title and version', () => {
    expect(doc.openapi).toMatch(/^3\.1\./);
    expect(doc.info.title).toBe('bookkeeprr API');
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('has the two public-API security schemes — no cookie auth in the docs', () => {
    expect(Object.keys(doc.components.securitySchemes).sort()).toEqual([
      'apiKeyAuth',
      'bearerAuth',
    ]);
  });

  it('defaults global security to bearer + api key', () => {
    const security = (doc as unknown as { security: unknown }).security;
    expect(security).toEqual([{ bearerAuth: [] }, { apiKeyAuth: [] }]);
  });

  it('has one operation per registry entry, under the right path+method', () => {
    for (const op of registry) {
      const pathItem = doc.paths[op.path];
      expect(pathItem, `missing path ${op.path}`).toBeDefined();
      expect(pathItem?.[op.method], `missing ${op.method} ${op.path}`).toBeDefined();
    }
  });

  it('points servers at a placeholder instance, not the doc host', () => {
    const servers = (doc as unknown as { servers: Array<{ url: string }> }).servers;
    expect(servers).toEqual([
      {
        url: 'https://bookkeeprr.domain.com',
        description: 'Your self-hosted bookkeeprr instance — substitute your own host.',
      },
    ]);
  });

  it('round-trips through JSON and resolves every $ref', () => {
    const json = JSON.parse(JSON.stringify(doc)) as typeof doc;
    for (const ref of collectRefs(json)) {
      expect(ref).toMatch(/^#\//);
      const target = ref
        .slice(2)
        .split('/')
        .reduce<unknown>((n, seg) => (n as Record<string, unknown>)?.[seg], json);
      expect(target, `dangling $ref ${ref}`).toBeDefined();
    }
  });
});

/** Collect every `$schema` string anywhere in the doc. */
function collectSchemaKeys(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => collectSchemaKeys(n, found));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema' && typeof v === 'string') found.push(v);
      else collectSchemaKeys(v, found);
    }
  }
  return found;
}

describe('generateOpenApiDoc — fixture-driven', () => {
  const fixtureOp: OperationDef = {
    method: 'post',
    path: '/api/widgets/{id}',
    tag: 'Widgets',
    summary: 'Update a widget',
    params: { id: z.coerce.number().int() },
    query: z.object({ verbose: z.coerce.boolean().optional() }),
    body: z.object({ name: z.string() }),
    responses: { 200: z.object({ ok: z.boolean() }), 204: null, 400: ErrorResponse },
  };

  const doc = generateOpenApiDoc([fixtureOp]) as Record<string, unknown>;
  const paths = doc.paths as Record<string, Record<string, unknown>>;
  const operation = paths['/api/widgets/{id}']?.['post'] as Record<string, unknown>;

  it('generates the correct path and method', () => {
    expect(paths['/api/widgets/{id}']).toBeDefined();
    expect(operation).toBeDefined();
  });

  it('includes id as a path parameter (required) and verbose as a query parameter (optional)', () => {
    const parameters = operation.parameters as Array<Record<string, unknown>>;
    const idParam = parameters.find((p) => p.name === 'id');
    const verboseParam = parameters.find((p) => p.name === 'verbose');

    expect(idParam).toMatchObject({ name: 'id', in: 'path', required: true });
    expect(verboseParam).toMatchObject({ name: 'verbose', in: 'query', required: false });
  });

  it('requestBody content schema has properties.name', () => {
    const requestBody = operation.requestBody as Record<string, unknown>;
    const content = requestBody.content as Record<string, unknown>;
    const schema = (content['application/json'] as Record<string, unknown>).schema as Record<
      string,
      unknown
    >;
    const properties = schema.properties as Record<string, unknown>;
    expect(properties.name).toBeDefined();
  });

  it('response 200 has JSON content and response 204 has no content key', () => {
    const responses = operation.responses as Record<string, Record<string, unknown> | undefined>;
    expect(responses['200']?.['content']).toBeDefined();
    expect(responses['204']?.['content']).toBeUndefined();
  });

  it('strips zod safe-integer bounds but keeps real constraints', () => {
    const intOp: OperationDef = {
      method: 'get',
      path: '/api/widgets/counts',
      tag: 'Widgets',
      summary: 'Integer fields',
      query: z.object({ page: z.coerce.number().int().min(1).optional() }),
      responses: {
        200: z.object({ total: z.number().int(), limit: z.number().int().min(1).max(100) }),
      },
    };
    const intDoc = generateOpenApiDoc([intOp]) as Record<string, unknown>;
    const intPaths = intDoc.paths as Record<string, Record<string, Record<string, unknown>>>;
    const intOperation = intPaths['/api/widgets/counts']?.['get'] as {
      parameters: Array<{ name: string; schema: Record<string, unknown> }>;
      responses: Record<
        string,
        { content: Record<string, { schema: { properties: Record<string, unknown> } }> }
      >;
    };

    // page: keeps minimum 1, loses the 2^53-1 ceiling.
    const pageSchema = intOperation.parameters.find((p) => p.name === 'page')?.schema;
    expect(pageSchema).toMatchObject({ minimum: 1 });
    expect(pageSchema).not.toHaveProperty('maximum');

    const props =
      intOperation.responses['200']!.content['application/json']!.schema.properties;
    // total: bare int() loses both synthetic bounds.
    expect(props.total).not.toHaveProperty('minimum');
    expect(props.total).not.toHaveProperty('maximum');
    // limit: real min/max survive.
    expect(props.limit).toMatchObject({ minimum: 1, maximum: 100 });
  });

  it('has no $schema key anywhere in the generated doc', () => {
    const schemaKeys = collectSchemaKeys(doc);
    expect(schemaKeys).toHaveLength(0);
  });

  it('throws on duplicate operations', () => {
    expect(() => generateOpenApiDoc([fixtureOp, fixtureOp])).toThrow(/Duplicate operation/);
  });

  it('open: true emits security: [] on the operation', () => {
    const openOp: OperationDef = {
      method: 'post',
      path: '/api/widgets/login',
      tag: 'Widgets',
      summary: 'Open endpoint',
      open: true,
      responses: { 200: z.object({ ok: z.boolean() }) },
    };
    const openDoc = generateOpenApiDoc([openOp]) as Record<string, unknown>;
    const openPaths = openDoc.paths as Record<string, Record<string, Record<string, unknown>>>;
    expect(openPaths['/api/widgets/login']?.['post']?.['security']).toEqual([]);
  });

  it("security: 'bearer' emits [{bearerAuth: []}] and the bearerAuth scheme exists", () => {
    const bearerOp: OperationDef = {
      method: 'get',
      path: '/api/widgets/summary',
      tag: 'Widgets',
      summary: 'Bearer-only endpoint',
      security: 'bearer',
      responses: { 200: z.object({ ok: z.boolean() }) },
    };
    const bearerDoc = generateOpenApiDoc([bearerOp]) as Record<string, unknown>;
    const bearerPaths = bearerDoc.paths as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(bearerPaths['/api/widgets/summary']?.['get']?.['security']).toEqual([
      { bearerAuth: [] },
    ]);
    const components = bearerDoc.components as {
      securitySchemes: Record<string, Record<string, unknown>>;
    };
    expect(components.securitySchemes['bearerAuth']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('neither open nor security → no per-op security key (the global default applies)', () => {
    expect(operation.security).toBeUndefined();
  });

  it('throws when responses map is empty', () => {
    expect(() => generateOpenApiDoc([{ ...fixtureOp, responses: {} }])).toThrow(/No responses/);
  });
});
