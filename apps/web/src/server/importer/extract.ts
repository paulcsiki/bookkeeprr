import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { QbtFile } from '@/server/integrations/qbittorrent';

const execFileP = promisify(execFile);

const OUTER_ARCHIVE_RE = /\.(zip|rar|7z)$/i;
const SEVENZIP_BIN = process.env.BOOKKEEPRR_7Z_BIN ?? '7zz';

export function isOuterArchive(name: string): boolean {
  return OUTER_ARCHIVE_RE.test(name);
}

export type Unpacked = { tempDir: string; files: QbtFile[] };

export async function unpackArchive(absolutePath: string): Promise<Unpacked | null> {
  let tempDir: string;
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'bookkeeprr-unpack-'));
  } catch {
    return null;
  }
  try {
    await execFileP(SEVENZIP_BIN, ['x', '-y', `-o${tempDir}`, absolutePath], {
      timeout: 60_000,
    });
  } catch {
    return null;
  }
  const entries = await readdir(tempDir, { recursive: true, withFileTypes: true });
  const files: QbtFile[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = join(e.parentPath ?? tempDir, e.name);
    const s = await stat(full);
    files.push({ name: full, size: s.size, progress: 1 });
  }
  return { tempDir, files };
}
