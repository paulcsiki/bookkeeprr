// Emit the OpenAPI document. Usage:
//   pnpm -F @bookkeeprr/web openapi:emit              # → stdout
//   pnpm -F @bookkeeprr/web openapi:emit <outfile>    # → file
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateOpenApiDoc } from '../src/server/openapi/generate';

const json = `${JSON.stringify(generateOpenApiDoc(), null, 2)}\n`;
const out = process.argv[2];
if (!out) {
  process.stdout.write(json);
} else {
  if (out.startsWith('-')) {
    console.error(`emit-openapi: unexpected flag '${out}'. Usage: openapi:emit [outfile]`);
    process.exit(1);
  }
  const p = resolve(out);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, json);
  console.log(`wrote ${p}`);
}
