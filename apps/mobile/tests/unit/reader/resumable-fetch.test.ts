import { resumableFetchFile, type ResumeDeps } from '@/features/reader/lib/offline-download';

function makeDeps(over: Partial<ResumeDeps> = {}): ResumeDeps & {
  calls: { rangeHeader: string | undefined; fetchedTo: string[]; appended: [string, string][] };
} {
  const calls: { rangeHeader: string | undefined; fetchedTo: string[]; appended: [string, string][] } = {
    rangeHeader: undefined,
    fetchedTo: [],
    appended: [],
  };
  const deps: ResumeDeps = {
    statSize: over.statSize ?? (async () => 0),
    exists: over.exists ?? (async () => false),
    unlink: over.unlink ?? (async () => {}),
    appendFile: over.appendFile ?? (async (dest, src) => { calls.appended.push([dest, src]); }),
    finalSize: over.finalSize ?? (async () => 0),
    // fetchToPath returns { status, total } and records the Range header it saw.
    fetchToPath: over.fetchToPath ?? (async (_url, headers, path, _onBytes) => {
      calls.rangeHeader = headers['Range'];
      calls.fetchedTo.push(path);
      return { status: 200, total: 0 };
    }),
  };
  return Object.assign(deps, { calls });
}

describe('resumableFetchFile', () => {
  it('fresh file (no partial): normal GET to savePath, no Range header', async () => {
    const d = makeDeps({ statSize: async () => 0 });
    await resumableFetchFile('http://x/f', { Authorization: 'Bearer t' }, '/p/f', () => {}, undefined, d);
    expect(d.calls.rangeHeader).toBeUndefined();
    expect(d.calls.fetchedTo).toEqual(['/p/f']); // straight to savePath
  });

  it('partial on disk + 206: sends Range, fetches remainder to .part, appends, verifies total', async () => {
    const d = makeDeps({
      statSize: async () => 100,
      fetchToPath: async (_u, headers, path) => {
        // record Range + that the remainder went to the .part file
        d.calls.rangeHeader = headers['Range'];
        d.calls.fetchedTo.push(path);
        return { status: 206, total: 250 };
      },
      finalSize: async () => 250, // after append, on-disk size == total
    });
    const out = await resumableFetchFile('http://x/f', {}, '/p/f', () => {}, undefined, d);
    expect(d.calls.rangeHeader).toBe('bytes=100-');
    expect(d.calls.fetchedTo).toEqual(['/p/f.part']);
    expect(d.calls.appended).toEqual([['/p/f', '/p/f.part']]);
    expect(out).toBe('/p/f');
  });

  it('416 (already complete): skips — Range request is made but no append, file untouched', async () => {
    let remainderFetched = false;
    const d = makeDeps({
      statSize: async () => 250,
      fetchToPath: async (_u, _h, path) => {
        if (path.endsWith('.part')) remainderFetched = true;
        return { status: 416, total: 250 };
      },
    });
    const out = await resumableFetchFile('http://x/f', {}, '/p/f', () => {}, undefined, d);
    // The Range request goes to the .part probe path, but 416 means already done.
    expect(remainderFetched).toBe(true);
    expect(d.calls.appended).toEqual([]);
    expect(out).toBe('/p/f');
  });

  it('200 on a Range request (server ignored range): overwrites savePath from 0', async () => {
    const d = makeDeps({
      statSize: async () => 100,
      fetchToPath: async (_u, _h, path) => { d.calls.fetchedTo.push(path); return { status: 200, total: 250 }; },
    });
    await resumableFetchFile('http://x/f', {}, '/p/f', () => {}, undefined, d);
    // The 200-on-range path fetches to .part first, then re-fetches to savePath.
    expect(d.calls.fetchedTo).toEqual(['/p/f.part', '/p/f']);
    expect(d.calls.appended).toEqual([]);
  });

  it('206 then size mismatch: re-fetches the whole file from 0 once', async () => {
    let calls = 0;
    const d = makeDeps({
      statSize: async () => 100,
      fetchToPath: async (_u, _h, path) => {
        calls++;
        if (path.endsWith('.part')) return { status: 206, total: 250 };
        return { status: 200, total: 250 }; // the fallback full re-fetch
      },
      finalSize: async () => 999, // wrong — mismatch triggers re-fetch
    });
    await resumableFetchFile('http://x/f', {}, '/p/f', () => {}, undefined, d);
    expect(calls).toBe(2); // remainder + a from-0 re-fetch (exactly once, no infinite loop)
  });
});
