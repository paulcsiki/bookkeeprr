import { readdir, stat, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

// pino-roll writes `bookkeeprr.<yyyy-MM-dd>.<n>.log` (dot separators + a
// rotation index), not `bookkeeprr-<date>.log`. Match its actual output; the
// index is optional to tolerate pino-roll versions that omit it.
const FILENAME_RE = /^bookkeeprr\.\d{4}-\d{2}-\d{2}(?:\.\d+)?\.log$/;

/** True when `name` is a log filename pino-roll would emit. Exported so API
 * routes validate against the same pattern instead of duplicating the regex. */
export function isValidLogFileName(name: string): boolean {
  return FILENAME_RE.test(name);
}

function getLogDir(): string {
  return join(process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config', 'logs');
}

export type LogFileInfo = {
  name: string;
  sizeBytes: number;
  mtime: number;
};

export async function listLogFiles(): Promise<LogFileInfo[]> {
  const dir = getLogDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const matching = names.filter((n) => FILENAME_RE.test(n));
  const stats = await Promise.all(
    matching.map(async (name) => {
      const st = await stat(join(dir, name));
      return { name, sizeBytes: st.size, mtime: st.mtimeMs };
    }),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  return stats;
}

export type ReadLogFilePagedResult = {
  lines: string[];
  totalBytes: number;
  hasMore: boolean;
  nextBefore: number;
};

export async function readLogFilePaged(
  name: string,
  opts: { limit?: number; before?: number } = {},
): Promise<ReadLogFilePagedResult> {
  if (!FILENAME_RE.test(name)) {
    throw new Error(`invalid log file name: ${name}`);
  }
  const dir = getLogDir();
  const path = join(dir, name);
  const st = await stat(path);
  const totalBytes = st.size;
  const limit = opts.limit ?? 500;
  const end = opts.before ?? totalBytes;

  const buf = await readFile(path);
  const slice = buf.subarray(0, end).toString('utf8');
  const allLines = slice.split('\n');
  if (allLines[allLines.length - 1] === '') allLines.pop();
  const tail = allLines.slice(-limit);
  const consumedSlice = tail.join('\n');
  const consumedBytes = Buffer.byteLength(consumedSlice, 'utf8') + (tail.length > 0 ? 1 : 0);
  const hasMore = allLines.length > tail.length;
  const nextBefore = hasMore ? end - consumedBytes : 0;

  return { lines: tail, totalBytes, hasMore, nextBefore };
}

export async function pruneLogFiles(retentionDays: number): Promise<number> {
  const dir = getLogDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const name of names) {
    const m = /^bookkeeprr\.(\d{4})-(\d{2})-(\d{2})(?:\.\d+)?\.log$/.exec(name);
    if (m === null) continue;
    const fileDate = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getTime();
    if (fileDate < cutoff) {
      try {
        await unlink(join(dir, name));
        deleted++;
      } catch {
        // ignore
      }
    }
  }
  return deleted;
}
