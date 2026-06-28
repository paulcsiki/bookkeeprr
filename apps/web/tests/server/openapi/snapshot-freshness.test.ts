import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenApiDoc } from '@/server/openapi/generate';

// The website ships a COMMITTED spec snapshot (apps/website/public/openapi.json)
// because its Docker build has no apps/web install — the prebuild snapshot
// silently no-ops there and the committed file is what gets served. This test
// is the forcing function: whenever the registry/schemas change, regenerate
// with `pnpm --filter @bookkeeprr/website openapi:snapshot` and commit the
// result, or this turns red.
const SNAPSHOT = join(__dirname, '../../../../website/public/openapi.json');

describe('website spec snapshot', () => {
  it('matches the generated document (regenerate via openapi:snapshot)', () => {
    const committed = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as unknown;
    const generated = JSON.parse(JSON.stringify(generateOpenApiDoc())) as unknown;
    expect(committed).toEqual(generated);
  });
});
