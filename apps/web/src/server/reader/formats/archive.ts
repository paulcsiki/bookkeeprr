import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';
import { extname } from 'node:path';
import * as zip from './zip';

const execFileAsync = promisify(execFile);

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const ZIP_EXT_RE = /\.(cbz|zip|epub)$/i;

// PK\x03\x04 — local file header signature, i.e. a zip-family container.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function sevenZipBin(): string {
  return process.env.BOOKKEEPRR_7Z_BIN ?? '7z';
}

/**
 * Decide whether `path` is a zip-family container (cbz / zip / epub).
 * Trusts the extension when it matches; otherwise sniffs the first 4 bytes
 * for the `PK\x03\x04` local-header magic.
 */
export async function isZipFamily(path: string): Promise<boolean> {
  if (ZIP_EXT_RE.test(path)) return true;
  let fh;
  try {
    fh = await open(path, 'r');
    const head = Buffer.alloc(4);
    const { bytesRead } = await fh.read(head, 0, 4, 0);
    return bytesRead === 4 && head.equals(ZIP_MAGIC);
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

/**
 * Map a filename's extension to an image content-type.
 */
function contentTypeFor(name: string): string {
  const ext = extname(name).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * List image entries of a non-zip archive (cbr / rar / 7z) via the `7z` CLI.
 * `7z l -slt` emits one "Path = <name>" line per entry. On any failure
 * (binary missing, non-zero exit) we throw a clear production-only message —
 * the dev/CI host does not ship `7z`.
 */
async function sevenZipList(path: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(sevenZipBin(), ['l', '-slt', path], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const names: string[] = [];
    for (const line of stdout.split('\n')) {
      const m = line.match(/^Path = (.+)$/);
      if (m?.[1]) names.push(m[1].trim());
    }
    // The first "Path = " is the archive itself; drop entries that are not files.
    return names.filter((n) => n !== path);
  } catch {
    throw new Error('archive format requires 7z (production only): ' + path);
  }
}

/**
 * List image entry names in natural (numeric-aware) sort order, excluding
 * non-image files. Zip-family archives are read natively; everything else
 * falls back to `7z` (production only).
 */
export async function listImageEntries(path: string): Promise<string[]> {
  let names: string[];
  if (await isZipFamily(path)) {
    names = await zip.listEntries(path);
  } else {
    names = await sevenZipList(path);
  }
  return names
    .filter((n) => IMAGE_RE.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Read a single archive entry, returning its bytes and image content-type.
 * Zip-family archives are read natively; non-zip archives use `7z x -so`
 * (entry name passed as an exec arg, never via a shell string).
 */
export async function readArchiveEntry(
  path: string,
  name: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (await isZipFamily(path)) {
    const buffer = await zip.readEntry(path, name);
    return { buffer, contentType: contentTypeFor(name) };
  }
  try {
    const { stdout } = await execFileAsync(sevenZipBin(), ['x', '-so', path, name], {
      encoding: 'buffer',
      maxBuffer: 256 * 1024 * 1024,
    });
    return { buffer: stdout as Buffer, contentType: contentTypeFor(name) };
  } catch {
    throw new Error('archive format requires 7z (production only): ' + path);
  }
}
