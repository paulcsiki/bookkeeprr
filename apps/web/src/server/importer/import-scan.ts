import { readdir, stat, lstat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { getLibraryDir } from '@/server/content-type/paths';
import { listAllLibraryFilePaths } from '@/server/db/library-files';

const EXT: Record<ContentType, Set<string>> = {
  ebook: new Set(['.epub', '.mobi', '.azw3', '.pdf']),
  light_novel: new Set(['.epub', '.mobi', '.azw3', '.pdf']),
  audiobook: new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg']),
  manga: new Set(['.cbz', '.cbr', '.zip', '.rar']),
  comic: new Set(['.cbz', '.cbr', '.zip', '.rar']),
};
const PER_FILE: ReadonlySet<ContentType> = new Set(['ebook', 'light_novel']);

function cleanTitle(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s*-\s*v?\d+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ScanItem = {
  path: string;
  detectedTitle: string;
  contentType: ContentType;
  files: string[];
  sizeBytes: number;
};

export async function scanLibraryRootsForImport(): Promise<ScanItem[]> {
  const tracked = new Set(await listAllLibraryFilePaths());
  const out: ScanItem[] = [];

  for (const ct of CONTENT_TYPES) {
    const root = await getLibraryDir(ct);
    let top: string[];
    try {
      top = await readdir(root);
    } catch {
      continue;
    }

    if (PER_FILE.has(ct)) {
      // one item per ebook file (recurse one level into per-book folders too)
      for (const entry of top) {
        const p = join(root, entry);
        const st = await stat(p).catch(() => null);
        if (!st) continue;
        const files = st.isDirectory()
          ? await filesIn(p, EXT[ct])
          : EXT[ct].has(extname(entry).toLowerCase())
            ? [p]
            : [];
        for (const f of files) {
          if (tracked.has(f)) continue;
          const fst = await stat(f);
          out.push({
            path: f,
            detectedTitle: cleanTitle(basename(f)),
            contentType: ct,
            files: [f],
            sizeBytes: fst.size,
          });
        }
      }
    } else {
      // one item per immediate subfolder (audiobook/manga/comic)
      for (const entry of top) {
        const dir = join(root, entry);
        const st = await stat(dir).catch(() => null);
        if (!st?.isDirectory()) continue;
        const files = (await filesIn(dir, EXT[ct])).filter((f) => !tracked.has(f));
        if (files.length === 0) continue;
        let size = 0;
        for (const f of files) size += (await stat(f)).size;
        out.push({
          path: dir,
          detectedTitle: cleanTitle(entry),
          contentType: ct,
          files,
          sizeBytes: size,
        });
      }
    }
  }

  return out;
}

async function filesIn(dir: string, exts: Set<string>): Promise<string[]> {
  const acc: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: string[];
    try {
      entries = await readdir(d);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.startsWith('.')) continue;
      const p = join(d, e);
      // lstat (not stat) so we never follow symlinks — a circular symlink in the
      // library tree would otherwise re-enqueue an ancestor dir forever.
      const st = await lstat(p).catch(() => null);
      if (!st) continue;
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) stack.push(p);
      else if (exts.has(extname(e).toLowerCase())) acc.push(p);
    }
  }
  return acc;
}
