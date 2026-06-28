import { open } from 'node:fs/promises';
import { extname } from 'node:path';

export type AudioInfo = { durationSec: number | null };

// We never load the whole audio file (an m4b can be >1GB). We read at most a
// 64 KB head window plus, for trailing-`moov` MP4s, a 64 KB tail window — so
// per-call memory stays bounded (~128 KB) regardless of file size.
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 64 * 1024;

/** Read up to `length` bytes at `position`, returning the populated slice. */
async function readWindow(
  fh: Awaited<ReturnType<typeof open>>,
  position: number,
  length: number,
): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0);
  const buf = Buffer.allocUnsafe(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/**
 * Best-effort audio duration probe for MP3 and MP4/M4A/M4B containers.
 *
 * No external deps and no transcoding: we read only the header window(s) we
 * need and parse just enough structure to estimate a duration. MUST NOT throw —
 * any parse failure yields `{ durationSec: null }`. The result is a hint only.
 */
export async function describeAudio(path: string): Promise<AudioInfo> {
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fh = await open(path, 'r');
    const { size } = await fh.stat();
    const head = await readWindow(fh, 0, Math.min(HEAD_BYTES, size));
    const ext = extname(path).toLowerCase();

    // ISO-BMFF / MP4 family: detect via the `ftyp` box at offset 4, or by ext.
    const isMp4Ext = ext === '.mp4' || ext === '.m4a' || ext === '.m4b';
    const hasFtyp = head.length >= 8 && head.toString('latin1', 4, 8) === 'ftyp';
    if (isMp4Ext || hasFtyp) {
      // Try the head first (leading-moov layout). If absent, scan a tail window
      // (trailing-moov layout) for moov -> mvhd.
      let d = mp4Duration(head);
      if (d === null && size > head.length) {
        const tailStart = Math.max(head.length, size - TAIL_BYTES);
        const tail = await readWindow(fh, tailStart, size - tailStart);
        d = mp4Duration(tail);
      }
      return { durationSec: d };
    }

    // MP3 (or anything with an MPEG audio frame): handle by ext or by sniffing.
    if (ext === '.mp3' || isLikelyMp3(head)) {
      const d = mp3Duration(head, size);
      return { durationSec: d };
    }

    return { durationSec: null };
  } catch {
    return { durationSec: null };
  } finally {
    await fh?.close();
  }
}

/** Quick sniff: an ID3 tag or an MPEG frame sync near the start. */
function isLikelyMp3(buf: Buffer): boolean {
  if (buf.length >= 3 && buf.toString('latin1', 0, 3) === 'ID3') return true;
  // 0xFF 0xEx frame sync (0xFFE) within the first few bytes.
  return buf.length >= 2 && buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0;
}

// ---------------------------------------------------------------------------
// MP4 / ISO-BMFF: walk top-level boxes to moov -> mvhd, read timescale+duration.
// ---------------------------------------------------------------------------
function mp4Duration(buf: Buffer): number | null {
  const moov = findBox(buf, 0, buf.length, 'moov');
  if (!moov) return null;
  const mvhd = findBox(buf, moov.dataStart, moov.dataEnd, 'mvhd');
  if (!mvhd) return null;

  let p = mvhd.dataStart;
  if (p + 4 > mvhd.dataEnd) return null;
  const version = buf[p] ?? 0;
  // version(1) + flags(3)
  p += 4;

  let timescale: number;
  let duration: number;
  if (version === 1) {
    // creation(8) modification(8) timescale(4) duration(8)
    if (p + 28 > mvhd.dataEnd) return null;
    p += 16;
    timescale = buf.readUInt32BE(p);
    p += 4;
    const hi = buf.readUInt32BE(p);
    const lo = buf.readUInt32BE(p + 4);
    duration = hi * 0x100000000 + lo;
  } else {
    // creation(4) modification(4) timescale(4) duration(4)
    if (p + 16 > mvhd.dataEnd) return null;
    p += 8;
    timescale = buf.readUInt32BE(p);
    p += 4;
    duration = buf.readUInt32BE(p);
  }

  if (!timescale || timescale <= 0) return null;
  const sec = duration / timescale;
  return sec > 0 ? sec : null;
}

type Box = { type: string; dataStart: number; dataEnd: number };

/** Find the first child box of `type` within [start, end). */
function findBox(buf: Buffer, start: number, end: number, type: string): Box | null {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const boxType = buf.toString('latin1', p + 4, p + 8);
    let headerLen = 8;
    if (size === 1) {
      // 64-bit largesize follows the type.
      if (p + 16 > end) break;
      const hi = buf.readUInt32BE(p + 8);
      const lo = buf.readUInt32BE(p + 12);
      size = hi * 0x100000000 + lo;
      headerLen = 16;
    } else if (size === 0) {
      // Box extends to end of file.
      size = end - p;
    }
    if (size < headerLen || p + size > end) break;
    if (boxType === type) {
      return { type, dataStart: p + headerLen, dataEnd: p + size };
    }
    p += size;
  }
  return null;
}

// ---------------------------------------------------------------------------
// MP3: skip ID3v2, find first valid MPEG frame, CBR-estimate from bitrate.
// ---------------------------------------------------------------------------

// Bitrate tables (kbps), keyed `${mpegGroup}-${layer}` where layer is the Roman
// numeral (1 = Layer I, 2 = Layer II, 3 = Layer III) as computed below
// (layer = 4 - layerBits). The key's second digit MUST match that numbering —
// an earlier version inverted it (keyed Layer III as `1-3` but stored Layer I
// bitrates), so every Layer III MP3 (the overwhelmingly common case) read 288
// kbps instead of 128 and reported durations ~2.25x too short.
const BITRATES: Record<string, (number | null)[]> = {
  // MPEG-1
  '1-1': [null, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, null], // Layer I
  '1-2': [null, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, null], // Layer II
  '1-3': [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null], // Layer III
  // MPEG-2 / 2.5
  '2-1': [null, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, null], // Layer I
  '2-2': [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null], // Layer II
  '2-3': [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null], // Layer III (= II for MPEG-2)
};

const SAMPLE_RATES: Record<string, number[]> = {
  '1': [44100, 48000, 32000], // MPEG-1
  '2': [22050, 24000, 16000], // MPEG-2
  '2.5': [11025, 12000, 8000], // MPEG-2.5
};

function mp3Duration(buf: Buffer, fileSize: number): number | null {
  let start = 0;

  // Skip an ID3v2 header if present: "ID3" + ver(2) + flags(1) + synchsafe size(4).
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size =
      (((buf[6] ?? 0) & 0x7f) << 21) |
      (((buf[7] ?? 0) & 0x7f) << 14) |
      (((buf[8] ?? 0) & 0x7f) << 7) |
      ((buf[9] ?? 0) & 0x7f);
    start = 10 + size;
  }

  // Find first frame sync: 11 set bits (0xFF followed by top 3 bits set).
  let i = start;
  const limit = Math.min(buf.length - 4, start + 0x10000); // bounded scan
  for (; i <= limit; i++) {
    const b1 = buf[i + 1] ?? 0;
    const b2 = buf[i + 2] ?? 0;
    if (buf[i] !== 0xff || (b1 & 0xe0) !== 0xe0) continue;

    // MPEG version: bits 4-3 of b1. 00=2.5, 01=reserved, 10=2, 11=1.
    const verBits = (b1 >> 3) & 0x03;
    if (verBits === 0x01) continue; // reserved
    const versionKey = verBits === 0x03 ? '1' : verBits === 0x02 ? '2' : '2.5';

    // Layer: bits 2-1 of b1. 00=reserved, 01=III, 10=II, 11=I.
    const layerBits = (b1 >> 1) & 0x03;
    if (layerBits === 0x00) continue; // reserved
    const layer = 4 - layerBits; // 01->III(3), 10->II(2), 11->I(1)

    // Bitrate index: bits 7-4 of b2.
    const brIndex = (b2 >> 4) & 0x0f;
    if (brIndex === 0x00 || brIndex === 0x0f) continue; // free/bad

    // Sample-rate index: bits 3-2 of b2.
    const srIndex = (b2 >> 2) & 0x03;
    if (srIndex === 0x03) continue; // reserved

    const mpegGroup = versionKey === '1' ? '1' : '2';
    const brKey = `${mpegGroup}-${layer}`;
    const brTable = BITRATES[brKey];
    if (!brTable) continue;
    const kbps = brTable[brIndex];
    const sampleRate = SAMPLE_RATES[versionKey]?.[srIndex];
    if (!kbps || !sampleRate) continue;

    // CBR estimate: audio bytes after tags, * 8 bits, / bitrate (bits/sec).
    // Use the total file size (we only hold the head window in memory) minus
    // the leading-tag offset; trailing tags are negligible for a hint.
    const audioBytes = fileSize - start;
    if (audioBytes <= 0) continue;
    const bitsPerSec = kbps * 1000;
    const sec = (audioBytes * 8) / bitsPerSec;
    return sec > 0 ? sec : null;
  }

  return null;
}
