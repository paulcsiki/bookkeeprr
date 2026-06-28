import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

/**
 * Parse an HTTP `Range` header for a resource of `size` bytes.
 *
 * Supports the single-range byte forms:
 *   - `bytes=start-end`    → { start, end } (end clamped to size-1)
 *   - `bytes=start-`       → { start, end: size-1 }
 *   - `bytes=-suffix`      → last `suffix` bytes
 *
 * Returns null when there is no header or it is not a `bytes=` range, and
 * 'unsatisfiable' when start >= size or start > end.
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | 'unsatisfiable' {
  if (header === null) return null;
  const trimmed = header.trim();
  if (!trimmed.startsWith('bytes=')) return null;

  const spec = trimmed.slice('bytes='.length).trim();
  // Only support a single range.
  if (spec.includes(',')) return null;

  const dash = spec.indexOf('-');
  if (dash === -1) return null;

  const startStr = spec.slice(0, dash).trim();
  const endStr = spec.slice(dash + 1).trim();

  let start: number;
  let end: number;

  if (startStr === '') {
    // Suffix range: bytes=-N → last N bytes.
    if (endStr === '') return null;
    const suffix = Number(endStr);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    if (suffix >= size) {
      start = 0;
    } else {
      start = size - suffix;
    }
    end = size - 1;
  } else {
    start = Number(startStr);
    if (!Number.isInteger(start) || start < 0) return null;
    if (endStr === '') {
      end = size - 1;
    } else {
      end = Number(endStr);
      if (!Number.isInteger(end) || end < 0) return null;
    }
    if (end > size - 1) end = size - 1;
  }

  if (start >= size || start > end) return 'unsatisfiable';

  return { start, end };
}

/**
 * Serve a file with HTTP range support.
 *
 * - No `Range` header → 200 with the full body.
 * - Unsatisfiable range → 416 with `Content-Range: bytes * /<size>`.
 * - Valid range → 206 with the requested slice.
 */
export async function serveFileRange(
  req: Request,
  absPath: string,
  contentType: string,
): Promise<Response> {
  const size = (await stat(absPath)).size;
  const range = parseRange(req.headers.get('range'), size);

  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  if (range === null) {
    const stream = Readable.toWeb(createReadStream(absPath)) as unknown as BodyInit;
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Length': String(size),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const { start, end } = range;
  const stream = Readable.toWeb(
    createReadStream(absPath, { start, end }),
  ) as unknown as BodyInit;
  return new Response(stream, {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    },
  });
}
