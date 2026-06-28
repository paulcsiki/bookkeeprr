import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface RouteOp {
  /** OpenAPI-style path, e.g. /api/series/{id} */
  path: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
}

const METHOD_RE = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

/** Walk apps/web/src/app/api and list every exported HTTP method per route. */
export function listRouteOps(apiDir: string): RouteOp[] {
  const ops: RouteOp[] = [];
  const walk = (dir: string, urlPath: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // Handle catch-all segments: [...slug] → {slug}
        const seg = entry.startsWith('[...')
          ? `{${entry.slice(4, -1)}}`
          : entry.startsWith('[')
            ? `{${entry.slice(1, -1)}}`
            : entry;
        walk(full, `${urlPath}/${seg}`);
      } else if (entry === 'route.ts') {
        const src = readFileSync(full, 'utf8');
        for (const m of src.matchAll(METHOD_RE)) {
          const methodName = m[1];
          if (methodName !== undefined) {
            ops.push({ path: urlPath, method: methodName.toLowerCase() as RouteOp['method'] });
          }
        }
      }
    }
  };
  walk(apiDir, '/api');
  return ops;
}
