import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { logger } from '@/server/logger';

const ARCHIVE_RE = /\.(cbz|cbr|zip|rar)$/i;

export async function* walk(
  rootPath: string,
): AsyncIterable<{ directory: string; files: string[] }> {
  const stack: string[] = [rootPath];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      logger().warn({ dir, err }, 'walk: readdir failed, skipping directory');
      continue;
    }

    const subdirs: string[] = [];
    const archives: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === '@eaDir') continue;
        subdirs.push(full);
      } else if (entry.isFile() && ARCHIVE_RE.test(entry.name)) {
        archives.push(full);
      }
    }

    if (archives.length > 0) {
      yield { directory: dir, files: archives };
    }
    for (const sd of subdirs) stack.push(sd);
  }
}
