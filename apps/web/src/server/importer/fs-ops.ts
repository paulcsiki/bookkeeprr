import { copyFileSync, createReadStream, linkSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, basename, extname, join } from 'node:path';

const HASH_THRESHOLD_BYTES = 50 * 1024 * 1024;
const MAX_SUFFIX = 50;

export function needsHash(sizeBytes: number): boolean {
  return sizeBytes > HASH_THRESHOLD_BYTES;
}

export function sameFilesystem(a: string, b: string): boolean {
  try {
    return statSync(a).dev === statSync(b).dev;
  } catch {
    return false;
  }
}

export async function hardlinkOrCopy(src: string, dst: string): Promise<void> {
  try {
    linkSync(src, dst);
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EXDEV') {
      copyFileSync(src, dst);
      return;
    }
    throw err;
  }
}

export async function sha1OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha1');
    const s = createReadStream(path);
    s.on('data', (chunk) => h.update(chunk));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

export type Comparison = 'identical' | 'different' | 'none';

export type ResolvedDestination = {
  path: string;
  action: 'write' | 'skip-identical' | 'suffixed';
};

function withSuffix(originalPath: string, n: number): string {
  if (n === 0) return originalPath;
  const dir = dirname(originalPath);
  const ext = extname(originalPath);
  const stem = basename(originalPath, ext);
  return join(dir, `${stem} (${n})${ext}`);
}

export async function resolveDestination(
  desiredPath: string,
  compare: (existingPath: string) => Promise<Comparison>,
): Promise<ResolvedDestination> {
  for (let n = 0; n <= MAX_SUFFIX; n++) {
    const candidate = withSuffix(desiredPath, n);
    const c = await compare(candidate);
    if (c === 'none') {
      return { path: candidate, action: n === 0 ? 'write' : 'suffixed' };
    }
    if (c === 'identical') {
      return { path: candidate, action: 'skip-identical' };
    }
    // 'different' → try next suffix
  }
  throw new Error(`exhausted-suffix: ${desiredPath}`);
}
