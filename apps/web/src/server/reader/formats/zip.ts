import { open, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

/**
 * Pure-Node ZIP reader (no `7z` / no process spawn).
 *
 * The production image does not ship `7z` on this dev/CI host, so zip-family
 * archives (cbz / zip / epub) are parsed here directly with `node:zlib`.
 *
 * ZIP layout (little-endian throughout), parsed in reverse from the end:
 *
 *   [ local file header + name + extra + data ] *      <- one per entry
 *   [ central directory header + name + extra + comment ] *
 *   [ end of central directory record (EOCD) ]
 *
 * To enumerate entries we find the EOCD (signature 0x06054b50) by scanning
 * backwards, read the central-directory offset/size from it, then walk the
 * central directory headers (signature 0x02014b50). To read an entry we use
 * the local-header offset stored in its central record, re-parse the LOCAL
 * file header (signature 0x04034b50) — whose filename/extra-field lengths can
 * differ from the central record — to find where the compressed data starts.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const EOCD_MIN_SIZE = 22; // EOCD without a trailing comment
const CENTRAL_FIXED = 46; // central directory header fixed portion
const LOCAL_FIXED = 30; // local file header fixed portion

interface CentralEntry {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  compSize: number;
  uncompSize: number;
  localHeaderOffset: number;
}

// The EOCD lives in the final 22 bytes + up to a 64 KB comment, so the tail
// window we read to find it never needs to exceed this.
const EOCD_TAIL_MAX = EOCD_MIN_SIZE + 0xffff;

/**
 * Locate the End Of Central Directory record by scanning backwards for its
 * signature within `buf`. `buf` is a tail window whose final byte corresponds
 * to file offset `tailEnd`; the returned offset is relative to `buf`. The EOCD
 * can be followed by a variable-length comment, so we search from the last
 * possible position toward the start of the window.
 */
function findEocdOffset(buf: Buffer): number {
  for (let i = buf.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error('zip: end of central directory not found');
}

/**
 * Parse a central-directory buffer (the bytes starting at the CD offset) into
 * an ordered list of entries. Offsets within each entry remain absolute file
 * offsets as stored in the record.
 */
function parseCentralBuffer(cd: Buffer, total: number): CentralEntry[] {
  const entries: CentralEntry[] = [];
  let p = 0;
  for (let i = 0; i < total; i++) {
    if (cd.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new Error('zip: bad central directory signature');
    }
    const method = cd.readUInt16LE(p + 10);
    const compSize = cd.readUInt32LE(p + 20);
    const uncompSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localHeaderOffset = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + CENTRAL_FIXED, p + CENTRAL_FIXED + nameLen);

    entries.push({ name, method, compSize, uncompSize, localHeaderOffset });
    p += CENTRAL_FIXED + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ---------------------------------------------------------------------------
// In-process LRU cache of parsed central directories, keyed by
// `path|mtimeMs|size`. This lets listEntries/readEntry reuse the parsed
// directory and avoids loading the entire archive into memory: only the EOCD
// tail and the central directory itself are read to enumerate, and only an
// entry's local-header + compressed-data slice is read to extract it.
// ---------------------------------------------------------------------------
const DIR_CACHE_MAX = 32;
const dirCache = new Map<string, CentralEntry[]>();

/** Read an open file handle's tail window of at most `length` bytes. */
async function readAt(
  fh: Awaited<ReturnType<typeof open>>,
  position: number,
  length: number,
): Promise<Buffer> {
  const buf = Buffer.allocUnsafe(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/**
 * Parse (or fetch from cache) the central directory for `path`, opening the
 * file only as far as needed. Returns the entries plus an open file handle the
 * caller may reuse for a positional entry read (caller must close it).
 */
async function loadDirectory(
  path: string,
): Promise<{ fh: Awaited<ReturnType<typeof open>>; entries: CentralEntry[] }> {
  const st = await stat(path);
  const key = `${path}|${st.mtimeMs}|${st.size}`;
  const fh = await open(path, 'r');
  try {
    const cached = dirCache.get(key);
    if (cached) {
      // Refresh LRU recency.
      dirCache.delete(key);
      dirCache.set(key, cached);
      return { fh, entries: cached };
    }

    const size = st.size;
    const tailLen = Math.min(size, EOCD_TAIL_MAX);
    const tail = await readAt(fh, size - tailLen, tailLen);
    const eocd = findEocdOffset(tail);
    const total = tail.readUInt16LE(eocd + 10); // total entries
    const cdOffset = tail.readUInt32LE(eocd + 16); // offset of central directory
    const cdSize = tail.readUInt32LE(eocd + 12); // size of central directory

    // The central directory may already be inside the tail window; if so reuse
    // those bytes, otherwise read exactly the CD slice.
    const tailStart = size - tailLen;
    let cd: Buffer;
    if (cdOffset >= tailStart) {
      cd = tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize);
    } else {
      cd = await readAt(fh, cdOffset, cdSize);
    }
    const entries = parseCentralBuffer(cd, total);

    dirCache.set(key, entries);
    if (dirCache.size > DIR_CACHE_MAX) {
      // Evict the oldest (first-inserted) key.
      const oldest = dirCache.keys().next().value;
      if (oldest !== undefined) dirCache.delete(oldest);
    }
    return { fh, entries };
  } catch (err) {
    await fh.close();
    throw err;
  }
}

/**
 * List all entry names in central-directory order.
 */
export async function listEntries(path: string): Promise<string[]> {
  const { fh, entries } = await loadDirectory(path);
  try {
    return entries.map((e) => e.name);
  } finally {
    await fh.close();
  }
}

/**
 * Read a single entry's bytes, decompressing deflate if needed.
 * Throws `zip entry not found: <name>` when the name is absent.
 *
 * Only the entry's local header + compressed-data slice is read from disk; the
 * whole archive is never loaded into memory.
 */
export async function readEntry(path: string, name: string): Promise<Buffer> {
  const { fh, entries } = await loadDirectory(path);
  try {
    const entry = entries.find((e) => e.name === name);
    if (!entry) throw new Error('zip entry not found: ' + name);

    // Read the LOCAL header fixed portion to get its (possibly different)
    // name/extra lengths, then the compressed data slice.
    const lh = entry.localHeaderOffset;
    const header = await readAt(fh, lh, LOCAL_FIXED);
    if (header.length < LOCAL_FIXED || header.readUInt32LE(0) !== SIG_LOCAL) {
      throw new Error('zip: bad local file header for ' + name);
    }
    const nameLen = header.readUInt16LE(26);
    const extraLen = header.readUInt16LE(28);
    const dataStart = lh + LOCAL_FIXED + nameLen + extraLen;
    const compressed = await readAt(fh, dataStart, entry.compSize);

    if (entry.method === 0) {
      // Stored — no compression.
      return Buffer.from(compressed);
    }
    if (entry.method === 8) {
      // Deflate — raw (no zlib header) as written by deflateRawSync.
      return inflateRawSync(compressed);
    }
    throw new Error('zip: unsupported compression method ' + entry.method + ' for ' + name);
  } finally {
    await fh.close();
  }
}
