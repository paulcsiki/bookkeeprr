import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listLogFiles, readLogFilePaged, pruneLogFiles } from '@/server/audit/log-files';

describe('log-files helpers', () => {
  let tmpDir: string;
  const ORIGINAL_CONFIG_DIR = process.env.BOOKKEEPRR_CONFIG_DIR;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bk-logs-'));
    process.env.BOOKKEEPRR_CONFIG_DIR = tmpDir;
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (ORIGINAL_CONFIG_DIR === undefined) {
      delete process.env.BOOKKEEPRR_CONFIG_DIR;
    } else {
      process.env.BOOKKEEPRR_CONFIG_DIR = ORIGINAL_CONFIG_DIR;
    }
  });

  function writeLog(name: string, content: string, mtimeMs?: number): void {
    const logsDir = join(tmpDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    const path = join(logsDir, name);
    writeFileSync(path, content);
    if (mtimeMs !== undefined) {
      const t = new Date(mtimeMs);
      utimesSync(path, t, t);
    }
  }

  describe('listLogFiles', () => {
    it('matches pino-roll output and sorts by mtime desc', async () => {
      // Real pino-roll filenames: bookkeeprr.<date>.<index>.log
      writeLog('bookkeeprr.2026-05-23.1.log', 'old', 1700000000000);
      writeLog('bookkeeprr.2026-05-25.1.log', 'new', 1700000200000);
      const files = await listLogFiles();
      expect(files).toHaveLength(2);
      expect(files[0]?.name).toBe('bookkeeprr.2026-05-25.1.log');
      expect(files[1]?.name).toBe('bookkeeprr.2026-05-23.1.log');
      expect(files[0]?.sizeBytes).toBeGreaterThan(0);
    });

    it('matches the index-less variant too', async () => {
      writeLog('bookkeeprr.2026-05-25.log', 'x');
      const files = await listLogFiles();
      expect(files.map((f) => f.name)).toEqual(['bookkeeprr.2026-05-25.log']);
    });

    it('ignores non-matching filenames (incl. the old hyphen format)', async () => {
      writeLog('bookkeeprr.2026-05-23.1.log', 'a');
      writeLog('random.log', 'b');
      writeLog('bookkeeprr-2026-05-23.log', 'c');
      const files = await listLogFiles();
      expect(files).toHaveLength(1);
      expect(files[0]?.name).toBe('bookkeeprr.2026-05-23.1.log');
    });

    it('returns empty when logs dir missing', async () => {
      expect(await listLogFiles()).toEqual([]);
    });
  });

  describe('readLogFilePaged', () => {
    it('returns the tail of a file (default 500 lines)', async () => {
      const lines = Array.from({ length: 800 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
      writeLog('bookkeeprr.2026-05-25.1.log', lines);
      const res = await readLogFilePaged('bookkeeprr.2026-05-25.1.log');
      expect(res.lines.length).toBe(500);
      expect(res.lines[res.lines.length - 1]).toBe('line 800');
      expect(res.hasMore).toBe(true);
    });

    it('supports the before offset for pagination', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
      writeLog('bookkeeprr.2026-05-25.1.log', lines);
      const first = await readLogFilePaged('bookkeeprr.2026-05-25.1.log', { limit: 30 });
      expect(first.hasMore).toBe(true);
      const second = await readLogFilePaged('bookkeeprr.2026-05-25.1.log', {
        limit: 30,
        before: first.nextBefore,
      });
      expect(second.lines.length).toBeGreaterThan(0);
    });

    it('returns hasMore=false when fully read', async () => {
      writeLog('bookkeeprr.2026-05-25.1.log', 'one line\n');
      const res = await readLogFilePaged('bookkeeprr.2026-05-25.1.log', { limit: 10 });
      expect(res.hasMore).toBe(false);
      expect(res.lines).toEqual(['one line']);
    });

    it('rejects path-traversal attempts and bad filenames', async () => {
      writeLog('bookkeeprr.2026-05-25.1.log', 'ok');
      await expect(readLogFilePaged('../etc/passwd')).rejects.toThrow();
      await expect(readLogFilePaged('bookkeeprr-bad.log')).rejects.toThrow();
    });
  });

  describe('pruneLogFiles', () => {
    it('deletes files older than retentionDays', async () => {
      const today = new Date();
      const fmt = (d: Date): string =>
        `bookkeeprr.${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}.1.log`;
      const oldDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
      writeLog(fmt(oldDate), 'old');
      writeLog(fmt(today), 'new');
      const deleted = await pruneLogFiles(7);
      expect(deleted).toBe(1);
      const remaining = await listLogFiles();
      expect(remaining.map((f) => f.name)).toEqual([fmt(today)]);
    });

    it('returns 0 when logs dir is missing', async () => {
      expect(await pruneLogFiles(7)).toBe(0);
    });

    it('ignores non-matching filenames', async () => {
      writeLog('random.log', 'x');
      writeLog('bookkeeprr-bad-name.log', 'x');
      const deleted = await pruneLogFiles(0);
      expect(deleted).toBe(0);
    });
  });
});
